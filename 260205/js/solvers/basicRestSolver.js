/**
 * 基础休息需求规则求解器
 * 负责处理休假配额管理和分配
 *
 * 正确的休假逻辑：
 * 1. 首先满足用户指定的特殊休假需求（REQ）
 *    - 类型A：使用年假/病假（消耗年假/病假配额）
 *    - 类型B：正常休息日（消耗法定休息日配额）
 * 2. 确保每个人的总休息日配额 = 法定休息日数量 + 年假/病假数量
 * 3. 剩余配额可以灵活分配
 * 4. 其余时间必须安排上班
 */

const REST_SHIFT_TYPES = new Set(['REST', 'NIGHT']);

function isRestShift(shift) {
    return REST_SHIFT_TYPES.has(shift);
}

const BasicRestSolver = {
    // 工作日班次类型
    WORK_SHIFT_TYPES: ['A1', 'A', 'A2', 'B1', 'B2', 'NIGHT'],

    /**
     * 处理基础休息需求规则
     * @param {Object} params - 参数对象
     * @returns {Object} 处理结果
     */
    processBasicRestRules(params) {
        const { staffData, personalRequests = {}, restDays = {}, scheduleConfig } = params;

        console.log('[BasicRestSolver] 开始处理休假配额管理...');

        // 1. 计算排班周期内的日期列表
        const dateList = this.generateDateList(scheduleConfig.startDate, scheduleConfig.endDate);

        // 2. 计算当月法定休息日数量
        const legalRestDayCount = this.countLegalRestDays(restDays, dateList);

        console.log(`[BasicRestSolver] 排班周期: ${scheduleConfig.startDate} 至 ${scheduleConfig.endDate}`);
        console.log(`[BasicRestSolver] 法定休息日数量: ${legalRestDayCount}`);

        // 3. 为每个人计算和分配休假配额
        const result = {
            personalRequests: JSON.parse(JSON.stringify(personalRequests)),
            restQuotas: {}, // 每个人的休假配额 {staffId: {legal: X, annual: 0, sick: 0, used: {}}}
            stats: {
                totalStaff: staffData.length,
                legalRestDayCount: legalRestDayCount,
                adjustments: []
            },
            warnings: []
        };

        staffData.forEach(staff => {
            const staffId = staff.id;

            // 3.1 初始化配额
            result.restQuotas[staffId] = {
                legal: legalRestDayCount,      // 法定休息日配额
                annual: 0,                      // 年假配额（从员工数据读取）
                sick: 0,                        // 病假配额（从员工数据读取）
                used: {
                    legal: [],                  // 已使用的法定休息日
                    annual: [],                 // 已使用的年假
                    sick: []                    // 已使用的病假
                }
            };

            // 3.2 从员工数据读取年假/病假配额（如果有的话）
            if (staff.annualLeaveDays !== undefined) {
                result.restQuotas[staffId].annual = staff.annualLeaveDays || 0;
            }
            if (staff.sickLeaveDays !== undefined) {
                result.restQuotas[staffId].sick = staff.sickLeaveDays || 0;
            }

            // 3.3 处理用户指定的特殊休假需求
            const currentRequests = personalRequests[staffId] || {};

            // 分类统计指定的休假日
            const specifiedLegalRests = []; // 指定为法定休息日的日期
            const specifiedAnnualSick = []; // 指定为年假/病假的日期

            Object.entries(currentRequests).forEach(([date, status]) => {
                if (status === 'ANNUAL') {
                    // 明确使用年假（无论是否是法定休息日）
                    specifiedAnnualSick.push(date);
                } else if (status === 'LEGAL') {
                    // 明确使用法定休息日配额（无论是否是法定休息日）
                    specifiedLegalRests.push(date);
                } else if (status === 'REQ') {
                    // 兼容旧格式，自动判断
                    if (restDays[date] === true) {
                        specifiedLegalRests.push(date);
                    } else {
                        // 工作日指定休假，使用年假或病假
                        specifiedAnnualSick.push(date);
                    }
                }
            });

            // 3.4 计算已使用的配额
            result.restQuotas[staffId].used.legal = specifiedLegalRests;
            result.restQuotas[staffId].used.annual = specifiedAnnualSick.slice(0, result.restQuotas[staffId].annual);
            result.restQuotas[staffId].used.sick = specifiedAnnualSick.slice(result.restQuotas[staffId].annual);

            // 3.5 检查配额是否足够
            const totalSpecified = specifiedLegalRests.length + specifiedAnnualSick.length;
            const totalQuota = legalRestDayCount + result.restQuotas[staffId].annual + result.restQuotas[staffId].sick;

            if (totalSpecified > totalQuota) {
                result.warnings.push({
                    staffId: staffId,
                    name: staff.name,
                    message: `指定休假天数 (${totalSpecified}) 超过配额 (${totalQuota})，将优先满足指定日期`
                });
            }

            console.log(`  员工 ${staffId} (${staff.name}):`);
            console.log(`    法定休息日配额: ${legalRestDayCount}, 已指定: ${specifiedLegalRests.length}`);
            console.log(`    年假配额: ${result.restQuotas[staffId].annual}, 已指定: ${result.restQuotas[staffId].used.annual.length}`);
            console.log(`    病假配额: ${result.restQuotas[staffId].sick}, 已指定: ${result.restQuotas[staffId].used.sick.length}`);
        });

        console.log('[BasicRestSolver] 休假配额计算完成');
        console.log(`[BasicRestSolver] 警告数: ${result.warnings.length}`);

        return result;
    },

    /**
     * 计算排班周期内每个人还需要的休息日数量
     * 在白班排班后调用，用于补充剩余的休息日配额
     * @param {Object} params - 参数对象
     * @returns {Object} 补充的休息日 {staffId: [date1, date2, ...]}
     */
    calculateRemainingRestDays(params) {
        const { staffData, scheduleConfig, restQuotas, currentSchedule, restDays, mandatoryRestDays = {} } = params;

        console.log('[BasicRestSolver] 计算剩余休息日配额...');

        const dateList = this.generateDateList(scheduleConfig.startDate, scheduleConfig.endDate);
        const result = {};

        // 将 mandatoryRestDays 合并到 currentSchedule 中
        const mergedSchedule = {};
        Object.entries(currentSchedule).forEach(([staffId, dates]) => {
            mergedSchedule[staffId] = { ...dates };
        });

        // 添加夜班后的必须休息日
        Object.entries(mandatoryRestDays).forEach(([staffId, dates]) => {
            if (!mergedSchedule[staffId]) {
                mergedSchedule[staffId] = {};
            }
            dates.forEach(dateStr => {
                if (!mergedSchedule[staffId][dateStr]) {
                    mergedSchedule[staffId][dateStr] = 'REST';
                }
            });
        });

        staffData.forEach(staff => {
            const staffId = staff.id;
            const quota = restQuotas[staffId];

            if (!quota) {
                console.warn(`  员工 ${staffId} 没有配额信息`);
                return;
            }

            // 1. 计算已使用的休息日
            const usedLegal = (quota.used.legal || []).length;
            const usedAnnual = (quota.used.annual || []).length;
            const usedSick = (quota.used.sick || []).length;

            // 夜班后的必须休息日数量
            const mandatoryCount = (mandatoryRestDays[staffId] || []).length;

            // 2. 计算已排班的班次天数
            let scheduledWorkDays = 0;
            if (currentSchedule && currentSchedule[staffId]) {
                Object.entries(currentSchedule[staffId]).forEach(([date, shift]) => {
                    if (shift && shift !== 'REST' && shift !== 'NIGHT') {
                        scheduledWorkDays++;
                    }
                });
            }

            // 3. 计算总配额
            const totalQuota = quota.legal + quota.annual + quota.sick;
            const totalUsed = usedLegal + usedAnnual + usedSick + mandatoryCount;

            // 4. 计算还需要休息的天数
            const remainingQuota = totalQuota - totalUsed;

            console.log(`  员工 ${staffId} (${staff.name}):`);
            console.log(`    已排班: ${scheduledWorkDays}天`);
            console.log(`    已用配额: ${totalUsed}/${totalQuota} (法定:${usedLegal}, 年假:${usedAnnual}, 病假:${usedSick}, 夜班后休息:${mandatoryCount})`);
            console.log(`    剩余配额: ${remainingQuota}天`);

            if (remainingQuota <= 0) {
                result[staffId] = [];
                return;
            }

            // 5. 找出可用的休息日（未排班）
            const availableDates = dateList.filter(date => {
                // 已排班（包括 mandatoryRestDays）
                if (mergedSchedule[staffId] && mergedSchedule[staffId][date]) {
                    return false;
                }
                // 法定休息日（自动计入法定休息日配额，不需要额外安排）
                if (restDays[date] === true) {
                    return false;
                }
                return true;
            });

            // 6. 选择最优的休息日（参考法定休息日格式，确保连续工作<=6天）
            const selectedDates = this.selectOptimalRestDaysWithConstraints(
                availableDates,
                remainingQuota,
                mergedSchedule[staffId] || {},
                restDays,
                dateList
            );

            result[staffId] = selectedDates;

            if (selectedDates.length > 0) {
                console.log(`    补充休息日: ${selectedDates.length}天 (${selectedDates.slice(0, 3).join(', ')}${selectedDates.length > 3 ? '...' : ''})`);
            }
        });

        return result;
    },

    /**
     * 选择最优的休息日（考虑约束条件）
     * 约束1：连续上班天数<=6天
     * 约束2：连休天数参考法定休息日格式（最多2-3天连休）
     * 约束3：休假间隔与法定节假日类似（均匀分布）
     */
    selectOptimalRestDaysWithConstraints(availableDates, needCount, existingSchedule, restDays, dateList) {
        if (availableDates.length === 0 || needCount <= 0) {
            return [];
        }

        // 1. 分析法定休息日的分布模式
        const legalRestDayPattern = this.analyzeLegalRestDayPattern(restDays, dateList);
        console.log(`    法定休息日模式: 平均间隔${legalRestDayPattern.avgInterval}天, 最长连休${legalRestDayPattern.maxConsecutive}天`);

        // 2. 贪心选择：每天评估是否添加休息日
        const selected = [];
        const simulatedSchedule = { ...existingSchedule }; // 复制用于模拟

        // 按优先级排序可用日期
        const scoredDates = this.scoreDatesWithConstraints(
            availableDates,
            simulatedSchedule,
            restDays,
            legalRestDayPattern,
            dateList
        );

        // 3. 贪心选择，每次检查约束
        for (const { date } of scoredDates) {
            if (selected.length >= needCount) break;

            // 模拟添加这个休息日
            simulatedSchedule[date] = 'REST';

            // 检查约束
            const maxConsecutiveWork = this.checkMaxConsecutiveWorkDays(simulatedSchedule, dateList);
            const maxConsecutiveRest = this.checkMaxConsecutiveRestDays(simulatedSchedule, date);

            // 约束1：连续上班<=6天
            if (maxConsecutiveWork > 6) {
                // 违反约束，回退
                delete simulatedSchedule[date];
                continue;
            }

            // 约束2：连休天数不能超过法定休息日最长连休+1（适度放宽）
            const maxAllowedConsecutive = Math.max(legalRestDayPattern.maxConsecutive, 2) + 1;
            if (maxConsecutiveRest > maxAllowedConsecutive) {
                // 违反约束，回退
                delete simulatedSchedule[date];
                continue;
            }

            // 约束3：检查间隔是否均匀（新增）
            const intervalScore = this.checkIntervalUniformity(simulatedSchedule, date, dateList, legalRestDayPattern.avgInterval);
            if (intervalScore < -5) {
                // 间隔太小，回退
                delete simulatedSchedule[date];
                continue;
            }

            // 通过约束检查，添加这个休息日
            selected.push(date);
        }

        return selected;
    },

    /**
     * 分析法定休息日的分布模式
     */
    analyzeLegalRestDayPattern(restDays, dateList) {
        const legalRestDates = dateList.filter(date => restDays[date] === true);

        if (legalRestDates.length === 0) {
            return { avgInterval: 7, maxConsecutive: 2 }; // 默认值：每周1天休息
        }

        // 计算最长连休
        let maxConsecutive = 1;
        let currentConsecutive = 1;
        for (let i = 1; i < legalRestDates.length; i++) {
            const prev = new Date(legalRestDates[i - 1]);
            const curr = new Date(legalRestDates[i]);
            const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);

            if (diffDays === 1) {
                currentConsecutive++;
                maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
            } else {
                currentConsecutive = 1;
            }
        }

        // 计算平均间隔
        let totalInterval = 0;
        let intervalCount = 0;
        for (let i = 1; i < legalRestDates.length; i++) {
            const prev = new Date(legalRestDates[i - 1]);
            const curr = new Date(legalRestDates[i]);
            const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
            totalInterval += diffDays;
            intervalCount++;
        }
        const avgInterval = intervalCount > 0 ? Math.round(totalInterval / intervalCount) : 7;

        return { avgInterval, maxConsecutive };
    },

    /**
     * 检查休息日间隔是否均匀
     * 返回得分：正数表示间隔合理，负数表示间隔太小
     */
    checkIntervalUniformity(schedule, targetDate, dateList, avgInterval) {
        // 找出targetDate之前的最后一个休息日
        let lastRestDate = null;
        let lastRestIndex = -1;

        for (let i = dateList.indexOf(targetDate) - 1; i >= 0; i--) {
            const date = dateList[i];
            const dateStr = date.dateStr || date;
            if (schedule[dateStr] === 'REST' || schedule[dateStr] === 'NIGHT') {
                lastRestDate = dateStr;
                lastRestIndex = i;
                break;
            }
        }

        if (!lastRestDate) {
            return 10; // 之前没有休息日，优先选择
        }

        // 计算距离上一个休息日的间隔
        const targetIndex = dateList.indexOf(targetDate);
        const interval = targetIndex - lastRestIndex - 1; // 工作天数

        // 计算得分：间隔接近avgInterval得分高，间隔太小得分低
        const diff = Math.abs(interval - avgInterval);
        if (diff === 0) {
            return 10; // 完美匹配
        } else if (diff <= 1) {
            return 5; // 很接近
        } else if (diff <= 2) {
            return 2; // 比较接近
        } else if (interval < 3) {
            return -10; // 间隔太小（工作日少于3天）
        } else {
            return 0; // 中性
        }
    },

    /**
     * 为日期打分（考虑约束条件）
     * 优先级：连续工作>间隔均匀>连休>周末
     */
    scoreDatesWithConstraints(availableDates, existingSchedule, restDays, pattern, dateList) {
        const existingRestDates = Object.entries(existingSchedule)
            .filter(([, shift]) => isRestShift(shift))
            .map(([date]) => date);
        const existingSet = new Set(existingRestDates);

        return availableDates.map(date => {
            let score = 0;

            // 因素1：检查连续工作天数（最高优先级）
            const consecutiveWorkBefore = this.countConsecutiveWorkDaysBefore(existingSchedule, date);
            if (consecutiveWorkBefore >= 6) {
                score += 100; // 必须休息，否则违反约束
            } else if (consecutiveWorkBefore >= 5) {
                score += 50;
            } else if (consecutiveWorkBefore >= 4) {
                score += 20;
            }

            // 因素2：检查间隔是否均匀（新增，高优先级）
            const intervalScore = this.checkIntervalUniformity(existingSchedule, date, dateList, pattern.avgInterval);
            score += intervalScore;

            // 因素3：连休倾向（降低权重，避免过多连休）
            const prevDate = this.getRelativeDate(date, -1);
            const nextDate = this.getRelativeDate(date, 1);

            if (existingSet.has(prevDate) && existingSet.has(nextDate)) {
                // 前后都休息，会形成3天连休
                const consecutiveCount = this.countConsecutiveRestDays(existingSchedule, date);
                if (consecutiveCount >= pattern.maxConsecutive) {
                    score -= 5; // 小惩罚：连休已达上限
                }
            } else if (existingSet.has(prevDate) || existingSet.has(nextDate)) {
                score += 1; // 小奖励：2天连休可以接受
            }
            // 注意：不再有"前后都休息"的额外奖励，避免3天以上连休

            // 因素4：优先选择周末（降低权重）
            const dayOfWeek = new Date(date).getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                score += 0.5;
            }

            // 因素5：法定休息日（低权重）
            if (restDays[date] === true) {
                score += 0.5;
            }

            return { date, score };
        }).sort((a, b) => b.score - a.score); // 降序排序
    },

    /**
     * 检查最大连续上班天数
     */
    checkMaxConsecutiveWorkDays(schedule, dateList) {
        let maxConsecutive = 0;
        let currentConsecutive = 0;

        dateList.forEach(date => {
            const shift = schedule[date];
            if (shift && !isRestShift(shift)) {
                currentConsecutive++;
                maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
            } else {
                currentConsecutive = 0;
            }
        });

        return maxConsecutive;
    },

    /**
     * 检查指定日期的连续休息天数
     */
    checkMaxConsecutiveRestDays(schedule, date) {
        return this.countConsecutiveRestDays(schedule, date);
    },

    /**
     * 计算连续休息天数（包含指定日期）
     */
    countConsecutiveRestDays(schedule, targetDate) {
        let count = 1; // 包含当前日期

        // 向前计数
        let prevDate = this.getRelativeDate(targetDate, -1);
        while (isRestShift(schedule[prevDate])) {
            count++;
            prevDate = this.getRelativeDate(prevDate, -1);
        }

        // 向后计数
        let nextDate = this.getRelativeDate(targetDate, 1);
        while (isRestShift(schedule[nextDate])) {
            count++;
            nextDate = this.getRelativeDate(nextDate, 1);
        }

        return count;
    },

    /**
     * 计算指定日期之前的连续上班天数
     */
    countConsecutiveWorkDaysBefore(schedule, targetDate) {
        let count = 0;
        let currentDate = this.getRelativeDate(targetDate, -1);

        while (currentDate) {
            const shift = schedule[currentDate];
            if (shift && !isRestShift(shift)) {
                count++;
                currentDate = this.getRelativeDate(currentDate, -1);
            } else {
                break;
            }
        }

        return count;
    },

    /**
     * 生成日期列表
     */
    generateDateList(startDate, endDate) {
        const dates = [];
        const current = new Date(startDate);
        const end = new Date(endDate);

        while (current <= end) {
            dates.push(this.formatDate(current));
            current.setDate(current.getDate() + 1);
        }

        return dates;
    },

    /**
     * 格式化日期为 YYYY-MM-DD
     */
    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    /**
     * 计算法定休息日天数
     */
    countLegalRestDays(restDays, dateList) {
        return dateList.filter(date => restDays[date] === true).length;
    },

    /**
     * 获取相对日期
     */
    getRelativeDate(date, offset) {
        const d = new Date(date);
        d.setDate(d.getDate() + offset);
        return this.formatDate(d);
    }
};
