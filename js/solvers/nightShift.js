/**
 * 夜班排班算法模块
 * 实现夜班排班的各项规则和约束
 */

const NightShiftSolver = {
    /**
     * 生成夜班排班方案
     * @param {Object} params - 排班参数
     * @param {Array} params.staffData - 人员数据列表
     * @param {Object} params.scheduleConfig - 排班配置 { startDate, endDate, year, month }
     * @param {Object} params.personalRequests - 个性化休假需求 { "staffId": { "YYYY-MM-DD": "REQ", ... } }
     * @param {Object} params.restDays - 法定休息日配置 { "YYYY-MM-DD": true/false }
     * @param {Object} params.rules - 夜班排班规则配置（可选，默认使用 NightShiftRules.getRules()）
     * @returns {Object} 排班结果 { schedule: { "staffId": { "YYYY-MM-DD": "NIGHT", ... } }, stats: {...} }
     */
    async generateNightShiftSchedule(params) {
        const { staffData, scheduleConfig, personalRequests = {}, restDays = {} } = params;
        
        // 获取规则配置
        let rules = params.rules;
        if (!rules && typeof NightShiftRules !== 'undefined') {
            rules = NightShiftRules.getRules();
        } else if (!rules) {
            // 如果没有规则配置，使用默认规则
            rules = {
                continuousNightShift: {
                    enabled: true,
                    maleDays: 4,
                    femaleDays: 3,
                    arrangementMode: 'continuous',
                    minIntervalDays: 7
                },
                menstrualPeriodRestriction: { enabled: true },
                lactationPregnancyRestriction: { enabled: true },
                reduceNightShiftDays: { enabled: true, reductionRatio: 0.2 },
                lastMonthCompensation: { enabled: true, priorityThreshold: 4 },
                averageDistribution: { enabled: true, groupByGender: true }
            };
        }

        // 生成日期列表
        const dateList = this.generateDateList(scheduleConfig.startDate, scheduleConfig.endDate);
        
        // 初始化排班结果
        const schedule = {};
        const stats = {
            totalNightShifts: 0,
            staffNightShiftCounts: {},
            errors: []
        };

        // 1. 过滤可用人员（排除哺乳期、孕妇等）
        const availableStaff = this.filterAvailableStaff(staffData, rules);
        
        // 2. 按性别分组
        const maleStaff = availableStaff.filter(s => s.gender === '男' || s.gender === 'M');
        const femaleStaff = availableStaff.filter(s => s.gender === '女' || s.gender === 'F');

        // 3. 计算每人应排的大夜天数
        const nightShiftDays = this.calculateNightShiftDays(
            availableStaff, 
            dateList, 
            personalRequests, 
            restDays, 
            rules
        );

        // 4. 根据安排模式（连续/分散）分配大夜
        if (rules.continuousNightShift.arrangementMode === 'continuous') {
            // 连续安排模式
            this.assignContinuousNightShifts(
                schedule, 
                availableStaff, 
                dateList, 
                nightShiftDays, 
                personalRequests, 
                restDays, 
                rules
            );
        } else {
            // 分散安排模式
            this.assignDistributedNightShifts(
                schedule, 
                availableStaff, 
                dateList, 
                nightShiftDays, 
                personalRequests, 
                restDays, 
                rules
            );
        }

        // 5. 统计结果
        this.calculateStats(schedule, stats);

        return {
            schedule: schedule,
            stats: stats
        };
    },

    /**
     * 生成日期列表
     */
    generateDateList(startDateStr, endDateStr) {
        const dateList = [];
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);
        const currentDate = new Date(startDate);

        const formatDateFn = typeof DateUtils !== 'undefined' ? DateUtils.formatDate.bind(DateUtils) : 
            (date) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

        while (currentDate <= endDate) {
            const dateStr = formatDateFn(currentDate);
            const dayOfWeek = currentDate.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            dateList.push({
                dateStr: dateStr,
                date: new Date(currentDate),
                day: currentDate.getDate(),
                weekday: dayOfWeek,
                isWeekend: isWeekend
            });

            currentDate.setDate(currentDate.getDate() + 1);
        }

        return dateList;
    },

    /**
     * 过滤可用人员（排除哺乳期、孕妇等）
     */
    filterAvailableStaff(staffData, rules) {
        if (!rules.lactationPregnancyRestriction.enabled) {
            return staffData;
        }

        return staffData.filter(staff => {
            // 排除哺乳期人员
            if (staff.isLactating === true || staff.lactating === true) {
                return false;
            }
            // 排除孕妇
            if (staff.isPregnant === true || staff.pregnant === true) {
                return false;
            }
            return true;
        });
    },

    /**
     * 计算每人应排的大夜天数
     */
    calculateNightShiftDays(staffData, dateList, personalRequests, restDays, rules) {
        const nightShiftDays = {};
        const workingDays = dateList.filter(d => {
            const isRestDay = restDays[d.dateStr] === true;
            const isFixedHolidayFn = typeof HolidayManager !== 'undefined' ? 
                HolidayManager.isFixedHoliday.bind(HolidayManager) : 
                (typeof window.isFixedHoliday === 'function' ? window.isFixedHoliday : () => false);
            const isFixedHoliday = isFixedHolidayFn(d.dateStr);
            return !isRestDay && !isFixedHoliday;
        }).length;

        // 按性别分组计算
        const maleStaff = staffData.filter(s => s.gender === '男' || s.gender === 'M');
        const femaleStaff = staffData.filter(s => s.gender === '女' || s.gender === 'F');

        // 计算总可用工作天数（排除个性化休假需求）
        const availableDays = workingDays - this.countPersonalRequestDays(personalRequests, dateList);

        // 根据规则计算每人应排天数
        staffData.forEach(staff => {
            const staffId = staff.staffId || staff.id;
            const isMale = staff.gender === '男' || staff.gender === 'M';
            
            // 基础天数（根据性别）
            let baseDays = isMale ? rules.continuousNightShift.maleDays : rules.continuousNightShift.femaleDays;

            // 考虑上月大夜补偿
            if (rules.lastMonthCompensation.enabled) {
                const lastMonthDays = staff.lastMonthNightShiftDays || 0;
                if (lastMonthDays >= rules.lastMonthCompensation.priorityThreshold) {
                    baseDays = Math.max(1, baseDays - 1); // 减少1天
                }
            }

            // 考虑减少大夜天数规则
            if (rules.reduceNightShiftDays.enabled) {
                // 随机或按优先级选择部分人员减少1天
                const shouldReduce = Math.random() < rules.reduceNightShiftDays.reductionRatio;
                if (shouldReduce) {
                    baseDays = Math.max(1, baseDays - 1);
                }
            }

            // 考虑平均分配（简化实现，实际应该考虑全年累计）
            if (rules.averageDistribution.enabled) {
                // 这里简化处理，实际应该考虑全年累计天数
                // 暂时使用基础天数
            }

            nightShiftDays[staffId] = baseDays;
        });

        return nightShiftDays;
    },

    /**
     * 统计个性化休假需求天数
     */
    countPersonalRequestDays(personalRequests, dateList) {
        let count = 0;
        Object.values(personalRequests).forEach(requests => {
            dateList.forEach(dateInfo => {
                if (requests[dateInfo.dateStr] === 'REQ') {
                    count++;
                }
            });
        });
        return count;
    },

    /**
     * 连续安排模式：分配连续的大夜
     */
    assignContinuousNightShifts(schedule, staffData, dateList, nightShiftDays, personalRequests, restDays, rules) {
        // 按性别分组
        const maleStaff = staffData.filter(s => s.gender === '男' || s.gender === 'M');
        const femaleStaff = staffData.filter(s => s.gender === '女' || s.gender === 'F');

        // 分配男性连续大夜（4天）
        this.assignContinuousForGroup(
            schedule, 
            maleStaff, 
            dateList, 
            rules.continuousNightShift.maleDays, 
            personalRequests, 
            restDays, 
            rules
        );

        // 分配女性连续大夜（3天）
        this.assignContinuousForGroup(
            schedule, 
            femaleStaff, 
            dateList, 
            rules.continuousNightShift.femaleDays, 
            personalRequests, 
            restDays, 
            rules
        );
    },

    /**
     * 为特定组分配连续大夜
     */
    assignContinuousForGroup(schedule, staffGroup, dateList, continuousDays, personalRequests, restDays, rules) {
        // 按优先级排序（上月大夜天数多的优先）
        const sortedStaff = [...staffGroup].sort((a, b) => {
            const aDays = a.lastMonthNightShiftDays || 0;
            const bDays = b.lastMonthNightShiftDays || 0;
            return aDays - bDays; // 上月天数少的优先
        });

        const usedDates = new Set(); // 已分配大夜的日期

        sortedStaff.forEach(staff => {
            const staffId = staff.staffId || staff.id;
            if (!schedule[staffId]) {
                schedule[staffId] = {};
            }

            // 检查生理期限制
            const menstrualPeriod = this.getMenstrualPeriod(staff, dateList, rules);
            
            // 查找可用的连续日期段
            const availablePeriod = this.findAvailableContinuousPeriod(
                dateList, 
                continuousDays, 
                personalRequests[staffId] || {}, 
                restDays, 
                menstrualPeriod, 
                usedDates
            );

            if (availablePeriod) {
                // 分配连续大夜
                availablePeriod.forEach(dateStr => {
                    schedule[staffId][dateStr] = 'NIGHT';
                    usedDates.add(dateStr);
                });
            } else {
                // 如果找不到连续日期段，尝试分散分配
                this.assignDistributedForStaff(
                    schedule, 
                    staff, 
                    dateList, 
                    continuousDays, 
                    personalRequests, 
                    restDays, 
                    rules, 
                    usedDates
                );
            }
        });
    },

    /**
     * 分散安排模式：分配分散的大夜
     */
    assignDistributedNightShifts(schedule, staffData, dateList, nightShiftDays, personalRequests, restDays, rules) {
        const minIntervalDays = rules.continuousNightShift.minIntervalDays || 7;
        
        // 按性别分组
        const maleStaff = staffData.filter(s => s.gender === '男' || s.gender === 'M');
        const femaleStaff = staffData.filter(s => s.gender === '女' || s.gender === 'F');

        // 分配男性分散大夜
        this.assignDistributedForGroup(
            schedule, 
            maleStaff, 
            dateList, 
            nightShiftDays, 
            personalRequests, 
            restDays, 
            rules, 
            minIntervalDays
        );

        // 分配女性分散大夜
        this.assignDistributedForGroup(
            schedule, 
            femaleStaff, 
            dateList, 
            nightShiftDays, 
            personalRequests, 
            restDays, 
            rules, 
            minIntervalDays
        );
    },

    /**
     * 为特定组分配分散大夜
     */
    assignDistributedForGroup(schedule, staffGroup, dateList, nightShiftDays, personalRequests, restDays, rules, minIntervalDays) {
        // 按优先级排序
        const sortedStaff = [...staffGroup].sort((a, b) => {
            const aDays = a.lastMonthNightShiftDays || 0;
            const bDays = b.lastMonthNightShiftDays || 0;
            return aDays - bDays;
        });

        const usedDates = new Set();

        sortedStaff.forEach(staff => {
            const staffId = staff.staffId || staff.id;
            const requiredDays = nightShiftDays[staffId] || 0;
            
            if (!schedule[staffId]) {
                schedule[staffId] = {};
            }

            this.assignDistributedForStaff(
                schedule, 
                staff, 
                dateList, 
                requiredDays, 
                personalRequests, 
                restDays, 
                rules, 
                usedDates, 
                minIntervalDays
            );
        });
    },

    /**
     * 为单个人员分配分散大夜
     */
    assignDistributedForStaff(schedule, staff, dateList, requiredDays, personalRequests, restDays, rules, usedDates, minIntervalDays = 7) {
        const staffId = staff.staffId || staff.id;
        const staffRequests = personalRequests[staffId] || {};
        
        // 检查生理期限制
        const menstrualPeriod = this.getMenstrualPeriod(staff, dateList, rules);
        
        // 获取可用日期（排除休息日、个性化休假、生理期、已分配日期）
        const availableDates = dateList.filter(dateInfo => {
            const dateStr = dateInfo.dateStr;
            // 排除休息日
            if (restDays[dateStr] === true) {
                return false;
            }
            // 排除固定节假日
            const isFixedHolidayFn = typeof HolidayManager !== 'undefined' ? 
                HolidayManager.isFixedHoliday.bind(HolidayManager) : 
                (typeof window.isFixedHoliday === 'function' ? window.isFixedHoliday : () => false);
            if (isFixedHolidayFn(dateStr)) {
                return false;
            }
            // 排除个性化休假需求
            if (staffRequests[dateStr] === 'REQ') {
                return false;
            }
            // 排除生理期
            if (menstrualPeriod.has(dateStr)) {
                return false;
            }
            // 排除已分配日期
            if (usedDates.has(dateStr)) {
                return false;
            }
            return true;
        });

        // 按最小间隔分配
        const assignedDates = [];
        let lastAssignedIndex = -minIntervalDays - 1;

        for (let i = 0; i < availableDates.length && assignedDates.length < requiredDays; i++) {
            const currentIndex = dateList.findIndex(d => d.dateStr === availableDates[i].dateStr);
            
            // 检查是否满足最小间隔
            if (currentIndex - lastAssignedIndex >= minIntervalDays) {
                assignedDates.push(availableDates[i].dateStr);
                lastAssignedIndex = currentIndex;
            }
        }

        // 如果无法满足最小间隔，放宽限制
        if (assignedDates.length < requiredDays) {
            const remaining = requiredDays - assignedDates.length;
            for (let i = 0; i < availableDates.length && assignedDates.length < requiredDays; i++) {
                const dateStr = availableDates[i].dateStr;
                if (!assignedDates.includes(dateStr)) {
                    assignedDates.push(dateStr);
                }
            }
        }

        // 分配大夜
        assignedDates.forEach(dateStr => {
            schedule[staffId][dateStr] = 'NIGHT';
            usedDates.add(dateStr);
        });
    },

    /**
     * 获取生理期时间段
     */
    getMenstrualPeriod(staff, dateList, rules) {
        const menstrualDates = new Set();
        
        if (!rules.menstrualPeriodRestriction.enabled) {
            return menstrualDates;
        }

        const menstrualPeriod = staff.menstrualPeriod || staff.menstrualPeriodType; // 'upper' 或 'lower'
        
        if (!menstrualPeriod) {
            return menstrualDates;
        }

        // 计算上半月和下半月的日期
        const midDate = Math.ceil(dateList.length / 2);
        const targetDates = menstrualPeriod === 'upper' || menstrualPeriod === '上' ? 
            dateList.slice(0, midDate) : 
            dateList.slice(midDate);

        targetDates.forEach(dateInfo => {
            menstrualDates.add(dateInfo.dateStr);
        });

        return menstrualDates;
    },

    /**
     * 查找可用的连续日期段
     */
    findAvailableContinuousPeriod(dateList, continuousDays, personalRequests, restDays, menstrualPeriod, usedDates) {
        for (let i = 0; i <= dateList.length - continuousDays; i++) {
            const period = dateList.slice(i, i + continuousDays);
            let isValid = true;

            for (const dateInfo of period) {
                const dateStr = dateInfo.dateStr;
                
                // 检查是否休息日
                if (restDays[dateStr] === true) {
                    isValid = false;
                    break;
                }
                
                // 检查是否固定节假日
                const isFixedHolidayFn = typeof HolidayManager !== 'undefined' ? 
                    HolidayManager.isFixedHoliday.bind(HolidayManager) : 
                    (typeof window.isFixedHoliday === 'function' ? window.isFixedHoliday : () => false);
                if (isFixedHolidayFn(dateStr)) {
                    isValid = false;
                    break;
                }
                
                // 检查是否个性化休假需求
                if (personalRequests[dateStr] === 'REQ') {
                    isValid = false;
                    break;
                }
                
                // 检查是否生理期
                if (menstrualPeriod.has(dateStr)) {
                    isValid = false;
                    break;
                }
                
                // 检查是否已分配
                if (usedDates.has(dateStr)) {
                    isValid = false;
                    break;
                }
            }

            if (isValid) {
                return period.map(d => d.dateStr);
            }
        }

        return null;
    },

    /**
     * 统计排班结果
     */
    calculateStats(schedule, stats) {
        Object.keys(schedule).forEach(staffId => {
            const nightShifts = Object.values(schedule[staffId]).filter(v => v === 'NIGHT').length;
            stats.staffNightShiftCounts[staffId] = nightShifts;
            stats.totalNightShifts += nightShifts;
        });
    }
};

// 暴露到全局作用域
if (typeof window !== 'undefined') {
    window.NightShiftSolver = NightShiftSolver;
}

