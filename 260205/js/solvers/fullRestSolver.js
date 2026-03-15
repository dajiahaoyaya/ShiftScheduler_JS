/**
 * 全量休息分配求解器
 *
 * 负责为每个人自动分配休假天数，确保达到排班周期要求的 totalRestDays。
 * 采用贪心算法 + 回溯优化的策略。
 */

const FullRestSolver = {
    /**
     * 求解休假分配问题
     * @param {Object} params - 求解参数
     * @returns {Object} { isValid, schedule, analysis, errors, warnings }
     */
    async solve(params) {
        const {
            staffData,
            scheduleConfig,
            restDaysSnapshot,
            nightSchedule,
            totalRestDays,
            yearMonth,
            constraints
        } = params;

        console.log('[FullRestSolver] 开始求解休假分配...');
        console.log(`  - 排班周期: ${scheduleConfig.startDate} - ${scheduleConfig.endDate}`);
        console.log(`  - 总休息日: ${totalRestDays}天`);
        console.log(`  - 人员数: ${staffData.length}`);

        // 生成日期列表
        const dateList = SchedulePeriodManager.generateDateList(
            scheduleConfig.startDate,
            scheduleConfig.endDate
        );

        // 初始化结果
        const schedule = {}; // { staffId: { dateStr: 'ANNUAL'|'LEGAL' } }
        const analysis = {
            totalStaff: staffData.length,
            totalVacationDays: 0,
            annualLeaveUsage: {},
            legalLeaveUsage: {},
            constraintViolations: []
        };

        // 为每个人分配休假
        for (const staff of staffData) {
            console.log(`  处理 ${staff.name}...`);

            // 1. 计算已指定休假天数
            const specifiedDays = VacationStatsHelper.calculateSpecifiedVacationDays(
                staff.id,
                yearMonth,
                totalRestDays
            );

            // 2. 计算需补充的休假天数
            const remainingDays = VacationStatsHelper.calculateRemainingVacationDays(
                staff.id,
                yearMonth,
                totalRestDays
            );

            console.log(`    已指定: ${specifiedDays.totalDays}天 (年假${specifiedDays.annualDays}, 法定休${specifiedDays.legalDays}), 需补充: ${remainingDays}天`);

            if (remainingDays === 0) {
                schedule[staff.id] = {};
                continue;
            }

            // 3. 分配休假
            const result = await this.assignVacationForStaff(
                staff,
                dateList,
                restDaysSnapshot,
                nightSchedule,
                remainingDays,
                yearMonth,
                constraints
            );

            schedule[staff.id] = result.assignedDates;
            analysis.annualLeaveUsage[staff.id] = result.annualDays;
            analysis.legalLeaveUsage[staff.id] = result.legalDays;
            analysis.totalVacationDays += result.totalDays;

            if (result.violations.length > 0) {
                analysis.constraintViolations.push({
                    staffId: staff.id,
                    staffName: staff.name,
                    violations: result.violations
                });
            }
        }

        // 4. 验证结果
        const validation = await this.validateSchedule(schedule, params);

        console.log('[FullRestSolver] 求解完成');
        console.log(`  - 总休假天数: ${analysis.totalVacationDays}`);
        console.log(`  - 年假使用: ${Object.values(analysis.annualLeaveUsage).reduce((sum, v) => sum + v, 0)}天`);
        console.log(`  - 法定休使用: ${Object.values(analysis.legalLeaveUsage).reduce((sum, v) => sum + v, 0)}天`);
        console.log(`  - 约束违反: ${analysis.constraintViolations.length}条`);

        return {
            isValid: validation.isValid,
            schedule,
            analysis,
            errors: validation.errors,
            warnings: validation.warnings
        };
    },

    /**
     * 为单个人员分配休假（贪心算法）
     */
    async assignVacationForStaff(
        staff,
        dateList,
        restDaysSnapshot,
        nightSchedule,
        targetDays,
        yearMonth,
        constraints
    ) {
        const assignedDates = {}; // { dateStr: 'ANNUAL'|'LEGAL' }
        let annualDays = VacationStatsHelper.calculateUsedAnnualLeaveInMonth(staff.id, yearMonth);
        let legalDays = 0;
        const violations = [];

        // 简化分配策略：优先使用法定休，年假作为补充
        // 默认每月年假使用不超过2天，剩余使用法定休
        const config = FullRestConfigRules ? FullRestConfigRules.getConfig() : null;
        const maxAnnualPerMonth = 2; // 固定为2天
        const targetAnnual = Math.min(targetDays, maxAnnualPerMonth - annualDays, targetDays);
        const targetLegal = targetDays - targetAnnual;

        console.log(`    目标: 年假${targetAnnual}天, 法定休${targetLegal}天 (已用年假${annualDays}天)`);

        // 获取候选日期列表（按优先级排序）
        const candidateDates = this.getCandidateDates(
            dateList,
            restDaysSnapshot,
            nightSchedule,
            staff
        );

        // 过滤掉已指定休假的日期
        const personalRequests = Store.state.personalRequests[staff.id] || {};
        const availableDates = candidateDates.filter(d => !personalRequests[d.dateStr]);

        // 贪心分配：依次选择最优日期
        for (const dateInfo of availableDates) {
            // 检查是否达到目标
            if (annualDays + legalDays >= targetDays) break;

            const dateStr = dateInfo.dateStr;

            // 检查约束（传入dateList以支持特殊节假日检测）
            const constraintCheck = this.checkAllConstraints(
                dateStr,
                assignedDates,
                nightSchedule,
                constraints,
                dateList  // 传入dateList以支持特殊节假日检测
            );

            if (!constraintCheck.satisfied) {
                continue;
            }

            // 决定休假类型
            const isLegalRest = restDaysSnapshot[dateStr] === true;
            const useAnnual = (annualDays < targetAnnual) && !isLegalRest;
            const useLegal = (legalDays < targetLegal) || isLegalRest;

            if (useAnnual || useLegal) {
                assignedDates[dateStr] = useAnnual ? 'ANNUAL' : 'LEGAL';
                if (useAnnual) annualDays++;
                else legalDays++;
            }
        }

        // 如果未达到目标，尝试放宽约束
        if (annualDays + legalDays < targetDays) {
            console.log(`    未达到目标，尝试放宽约束...`);
            const additional = await this.assignWithRelaxedConstraints(
                staff,
                availableDates,
                assignedDates,
                nightSchedule,
                targetDays - annualDays - legalDays,
                targetAnnual - annualDays,
                targetLegal - legalDays,
                restDaysSnapshot,
                constraints,
                dateList  // 传入dateList以支持特殊节假日检测
            );

            annualDays += additional.annual;
            legalDays += additional.legal;
            Object.assign(assignedDates, additional.dates);
            violations.push(...additional.violations);
        }

        console.log(`    分配结果: 年假${annualDays}天, 法定休${legalDays}天, 违反${violations.length}条约束`);

        return {
            assignedDates,
            annualDays,
            legalDays,
            totalDays: annualDays + legalDays,
            violations
        };
    },

    /**
     * 获取候选日期列表（按优先级排序）
     */
    getCandidateDates(dateList, restDaysSnapshot, nightSchedule, staff) {
        return dateList
            .filter(dateInfo => {
                // 排除已排大夜的日期
                if (FullRestConfigRules && FullRestConfigRules.checkNightShiftConflict(dateInfo.dateStr, nightSchedule[staff.id] || {})) {
                    return false;
                }
                return true;
            })
            .map(dateInfo => ({
                ...dateInfo,
                priority: this.calculateDatePriority(dateInfo, restDaysSnapshot)
            }))
            .sort((a, b) => b.priority - a.priority);
    },

    /**
     * 计算日期优先级
     */
    calculateDatePriority(dateInfo, restDaysSnapshot) {
        const holidayName = dateInfo.holidayName || dateInfo.lunarHoliday || '';

        // 特殊节假日优先级最高
        if (holidayName === '春节') return 100;
        if (holidayName === '国庆') return 90;
        if (['元旦', '清明', '五一', '端午', '中秋'].includes(holidayName)) return 80;

        // 法定休（非周末的工作日被设为休息）
        if (restDaysSnapshot[dateInfo.dateStr] === true) return 60;

        // 周末
        if (dateInfo.isWeekend) return 50;

        // 普通工作日
        return 10;
    },

    /**
     * 检查所有约束
     * @param {string} dateStr - 候选日期
     * @param {Object} assignedDates - 已分配的休假日期对象 { dateStr: 'ANNUAL'|'LEGAL' }
     * @param {Object} nightSchedule - 大夜排班数据
     * @param {Object} constraints - 约束配置
     * @param {Array} dateList - 日期列表（用于检测特殊节假日）
     * @returns {Object} { satisfied: boolean, violations: Array }
     */
    checkAllConstraints(dateStr, assignedDates, nightSchedule, constraints, dateList = null) {
        const result = { satisfied: true, violations: [] };
        const assignedDatesArray = Object.keys(assignedDates);

        // 1. 大夜后休息约束（严格约束）
        if (FullRestConfigRules && !FullRestConfigRules.checkRestAfterNightShift(dateStr, nightSchedule, constraints.minRestAfterNightShift || 2)) {
            result.satisfied = false;
            result.violations.push({ type: 'NIGHT_SHIFT_BUFFER', message: '大夜后必须休息' });
            return result;
        }

        // 2. 连续休假约束（考虑特殊节假日，可以放宽）
        if (FullRestConfigRules) {
            const consecutiveCheck = FullRestConfigRules.checkConsecutiveRest(
                assignedDatesArray,
                dateStr,
                constraints.maxConsecutiveRestDays || 2,
                dateList
            );

            // 连续休假约束返回的是对象格式 { satisfied, maxAllowed, actualDays, specialHoliday, reason }
            if (!consecutiveCheck.satisfied) {
                result.violations.push({
                    type: 'CONSECUTIVE_REST',
                    message: consecutiveCheck.reason || '连续休假超过限制',
                    isWarning: true,
                    details: consecutiveCheck
                });
            }
        }

        // 3. 休假间隔约束（可以放宽）
        if (FullRestConfigRules && !FullRestConfigRules.checkRestInterval(assignedDatesArray, dateStr, constraints.maxRestInterval || 5)) {
            result.violations.push({ type: 'REST_INTERVAL', message: '休假间隔过大', isWarning: true });
        }

        return result;
    },

    /**
     * 放宽约束分配
     * @param {Object} staff - 人员对象
     * @param {Array} candidateDates - 候选日期列表
     * @param {Object} assignedDates - 已分配的休假日期对象
     * @param {Object} nightSchedule - 大夜排班数据
     * @param {number} remainingDays - 需补充的天数
     * @param {number} targetAnnual - 目标年假天数
     * @param {number} targetLegal - 目标法定休天数
     * @param {Object} restDaysSnapshot - 休息日快照
     * @param {Object} constraints - 约束配置
     * @param {Array} dateList - 日期列表（用于特殊节假日检测）
     */
    async assignWithRelaxedConstraints(
        staff,
        candidateDates,
        assignedDates,
        nightSchedule,
        remainingDays,
        targetAnnual,
        targetLegal,
        restDaysSnapshot,
        constraints,
        dateList = null
    ) {
        const additional = { dates: {}, annual: 0, legal: 0, violations: [] };
        const assignedDatesArray = Object.keys(assignedDates);

        for (const dateInfo of candidateDates) {
            if (additional.annual + additional.legal >= remainingDays) break;

            const dateStr = dateInfo.dateStr;
            if (assignedDates[dateStr]) continue;

            // 只放宽"休假间隔"和"连续休假"约束，保持"大夜后休息"约束
            if (FullRestConfigRules && !FullRestConfigRules.checkRestAfterNightShift(dateStr, nightSchedule[staff.id] || {}, constraints.minRestAfterNightShift || 2)) {
                continue;
            }

            // 决定休假类型
            const isLegalRest = restDaysSnapshot[dateStr] === true;
            const useAnnual = (additional.annual < targetAnnual) && !isLegalRest;
            const useLegal = (additional.legal < targetLegal) || isLegalRest;

            if (useAnnual || useLegal) {
                additional.dates[dateStr] = useAnnual ? 'ANNUAL' : 'LEGAL';
                if (useAnnual) additional.annual++;
                else additional.legal++;

                // 记录违规（包含特殊节假日相关信息）
                const specialHoliday = dateList && FullRestConfigRules
                    ? FullRestConfigRules.identifySpecialHoliday(dateStr)
                    : null;

                additional.violations.push({
                    date: dateStr,
                    type: 'RELAXED_CONSTRAINT',
                    message: '放宽了约束' + (specialHoliday ? `（${specialHoliday.name}期间）` : ''),
                    isWarning: true,
                    specialHoliday: specialHoliday ? specialHoliday.name : null
                });
            }
        }

        return additional;
    },

    /**
     * 验证排班结果
     */
    async validateSchedule(schedule, params) {
        const errors = [];
        const warnings = [];

        // 1. 检查是否与大夜冲突
        for (const staffId in schedule) {
            const staffSchedule = schedule[staffId];
            const nightSchedule = params.nightSchedule[staffId] || {};

            for (const dateStr in staffSchedule) {
                if (nightSchedule[dateStr]) {
                    errors.push(`${staffId}: 日期 ${dateStr} 与大夜冲突`);
                }
            }
        }

        // 2. 统计约束违反情况（已在分配过程中记录）

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }
};

// 如果在浏览器环境中，挂载到全局
if (typeof window !== 'undefined') {
    window.FullRestSolver = FullRestSolver;
}
