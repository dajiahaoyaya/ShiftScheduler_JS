/**
 * 职能均衡管理器模块
 * 负责职能的月度和全年均衡分配优化（支持配置化）
 */

const FunctionBalanceManager = {
    // 在线职能列表
    ONLINE_FUNCTIONS: ['网', '天', '微', '毛', '银B', '收'],

    // 业务支持职能列表
    BIZ_SUPPORT_FUNCTIONS: ['星', '追', '综'],

    // 所有职能列表
    ALL_FUNCTIONS: ['网', '天', '微', '毛', '银B', '收', '星', '追', '综'],

    /**
     * 获取职能均衡规则配置
     * @returns {Object} - 规则配置对象
     */
    getRules() {
        if (typeof FunctionBalanceRules !== 'undefined') {
            return FunctionBalanceRules.getRules();
        }
        // 如果 FunctionBalanceRules 未加载，返回默认配置
        return {
            enabled: false,
            balancedFunctions: [],
            monthlyMaxDeviation: 1,
            yearlyMaxDeviation: 3,
            strategy: 'flexible'
        };
    },

    /**
     * 检查职能均衡是否启用
     * @returns {boolean}
     */
    isEnabled() {
        const rules = this.getRules();
        return rules.enabled && rules.balancedFunctions.length > 0;
    },

    /**
     * 获取需要均衡的职能列表
     * @returns {Array} - 职能ID列表
     */
    getBalancedFunctions() {
        const rules = this.getRules();
        return rules.enabled ? rules.balancedFunctions : [];
    },

    /**
     * 检查某个职能是否需要均衡
     * @param {string} functionId - 职能ID
     * @returns {boolean}
     */
    isFunctionBalanced(functionId) {
        const rules = this.getRules();
        return rules.enabled && rules.balancedFunctions.includes(functionId);
    },

    /**
     * 统计某人某月各职能次数
     * @param {string} staffId - 人员ID
     * @param {number} year - 年份
     * @param {number} month - 月份（1-12）
     * @param {Object} schedule - 排班结果（可选，默认从Store获取）
     * @returns {Object} - {网: 5, 天: 3, ..., 追: 2, 综: 1, 星: 3}
     */
    calculateMonthlyFunctionCount(staffId, year, month, schedule = null) {
        // 如果没有传入schedule，从Store获取
        if (!schedule) {
            const finalSchedule = typeof Store !== 'undefined' ? Store.getFinalSchedule() : null;
            if (!finalSchedule || !finalSchedule[staffId]) {
                return this.getEmptyFunctionCount();
            }
            schedule = finalSchedule;
        }

        if (!schedule || !schedule[staffId]) {
            return this.getEmptyFunctionCount();
        }

        const monthSchedule = schedule[staffId];
        const counts = this.getEmptyFunctionCount();

        try {
            Object.entries(monthSchedule).forEach(([dateStr, shiftInfo]) => {
                const date = new Date(dateStr);

                // 检查日期是否匹配指定年月
                const dateYear = date.getFullYear();
                const dateMonth = date.getMonth() + 1;

                if (dateYear === year && dateMonth === month) {
                    // 解析班次信息，提取职能
                    const functions = this.extractFunctionsFromShift(shiftInfo);
                    functions.forEach(func => {
                        if (counts[func] !== undefined) {
                            counts[func]++;
                        }
                    });
                }
            });
        } catch (error) {
            console.warn(`[FunctionBalanceManager] 计算职能次数时出错 (staffId: ${staffId}):`, error);
        }

        return counts;
    },

    /**
     * 统计某人全年各职能累计次数
     * @param {string} staffId - 人员ID
     * @param {number} year - 年份
     * @param {Object} schedule - 排班结果（可选，默认从Store获取）
     * @returns {Object} - {网: 60, 天: 36, ..., 追: 24, 综: 12, 星: 36}
     */
    calculateYearlyFunctionCount(staffId, year, schedule = null) {
        let total = this.getEmptyFunctionCount();

        for (let month = 1; month <= 12; month++) {
            const monthCount = this.calculateMonthlyFunctionCount(staffId, year, month, schedule);
            Object.entries(monthCount).forEach(([func, count]) => {
                total[func] += count;
            });
        }

        return total;
    },

    /**
     * 计算职能均衡得分
     * @param {string} staffId - 人员ID
     * @param {string} functionId - 职能ID
     * @param {number} year - 年份
     * @param {number} month - 月份
     * @returns {number} - 得分（越高表示越需要分配该职能）
     */
    calculateBalanceScore(staffId, functionId, year, month) {
        // 如果该职能不需要均衡，返回0
        if (!this.isFunctionBalanced(functionId)) {
            return 0;
        }

        const rules = this.getRules();

        // 获取本月已排次数（截至当前日期）
        const monthlyCount = this.calculateMonthlyFunctionCount(staffId, year, month);
        const currentMonthlyCount = monthlyCount[functionId] || 0;

        // 获取本月平均值（基于人力配置计算）
        const staffData = typeof Store !== 'undefined' ? Store.getStaffData() : [];
        const totalStaff = staffData.length;
        const monthlyAvg = this.getMonthlyTarget(functionId, month, totalStaff);

        // 获取全年累计
        const yearlyCount = this.calculateYearlyFunctionCount(staffId, year);
        const currentYearlyCount = yearlyCount[functionId] || 0;

        // 获取全年平均值
        const yearlyAvg = this.getYearlyTarget(functionId, totalStaff, year);

        // 计算偏差
        const monthlyDeviation = currentMonthlyCount - monthlyAvg;
        const yearlyDeviation = currentYearlyCount - yearlyAvg;

        // 得分 = -(本月偏差) - 0.5 * (全年偏差)
        // 负数表示已超过平均（优先级低），正数表示低于平均（优先级高）
        const score = -monthlyDeviation - 0.5 * yearlyDeviation;

        return score;
    },

    /**
     * 检查某人的某职能是否均衡
     * @param {string} staffId - 人员ID
     * @param {string} functionId - 职能ID
     * @param {number} year - 年份
     * @param {number} month - 月份
     * @returns {Object} - {isBalanced: boolean, monthlyDeviation: number, yearlyDeviation: number}
     */
    checkFunctionBalance(staffId, functionId, year, month) {
        if (!this.isFunctionBalanced(functionId)) {
            return {
                isBalanced: true,
                monthlyDeviation: 0,
                yearlyDeviation: 0,
                message: '该职能未启用均衡'
            };
        }

        const rules = this.getRules();
        const monthlyCount = this.calculateMonthlyFunctionCount(staffId, year, month);
        const yearlyCount = this.calculateYearlyFunctionCount(staffId, year);

        const monthlyAvg = this.getMonthlyTarget(functionId, month, -1);
        const yearlyAvg = this.getYearlyTarget(functionId, -1, year);

        const monthlyDeviation = (monthlyCount[functionId] || 0) - monthlyAvg;
        const yearlyDeviation = (yearlyCount[functionId] || 0) - yearlyAvg;

        const isMonthlyBalanced = Math.abs(monthlyDeviation) <= rules.monthlyMaxDeviation;
        const isYearlyBalanced = Math.abs(yearlyDeviation) <= rules.yearlyMaxDeviation;
        const isBalanced = isMonthlyBalanced && isYearlyBalanced;

        return {
            isBalanced,
            monthlyDeviation,
            yearlyDeviation,
            isMonthlyBalanced,
            isYearlyBalanced,
            monthlyTarget: monthlyAvg,
            yearlyTarget: yearlyAvg,
            monthlyActual: monthlyCount[functionId] || 0,
            yearlyActual: yearlyCount[functionId] || 0
        };
    },

    /**
     * 获取某职能某月的平均目标次数
     * @param {string} functionId - 职能ID
     * @param {number} month - 月份
     * @param {number} totalStaff - 总人数（-1表示自动获取）
     * @returns {number} - 平均目标次数
     */
    getMonthlyTarget(functionId, month, totalStaff = -1) {
        // 从DailyManpowerManager获取该职能该月的总需求
        const dailyDemand = this.getDailyDemandForFunction(functionId);

        // 获取当月工作日数量
        const workDays = this.getWorkDaysCount(month);

        // 月度总需求 = 每日需求 × 工作日数量
        const monthlyTotal = dailyDemand * workDays;

        // 如果没有传入总人数，自动获取
        if (totalStaff === -1) {
            const staffData = typeof Store !== 'undefined' ? Store.getStaffData() : [];
            totalStaff = staffData.length;
        }

        // 人均目标 = 月度总需求 / 总人数（向上取整）
        return Math.ceil(monthlyTotal / Math.max(totalStaff, 1));
    },

    /**
     * 获取某职能全年的平均目标次数
     * @param {string} functionId - 职能ID
     * @param {number} totalStaff - 总人数（-1表示自动获取）
     * @param {number} year - 年份
     * @returns {number} - 全年平均目标次数
     */
    getYearlyTarget(functionId, totalStaff = -1, year) {
        if (totalStaff === -1) {
            const staffData = typeof Store !== 'undefined' ? Store.getStaffData() : [];
            totalStaff = staffData.length;
        }

        let total = 0;
        for (let month = 1; month <= 12; month++) {
            total += this.getMonthlyTarget(functionId, month, totalStaff);
        }
        // 月均目标 = 年度总需求 / 12
        return Math.ceil(total / 12);
    },

    /**
     * 获取空的职能计数对象
     * @returns {Object} - 所有职能初始化为0
     */
    getEmptyFunctionCount() {
        const count = {};
        this.ALL_FUNCTIONS.forEach(func => {
            count[func] = 0;
        });
        return count;
    },

    /**
     * 从班次信息中提取职能列表
     * @param {Object|string} shiftInfo - 班次信息
     * @returns {Array} - 职能列表
     */
    extractFunctionsFromShift(shiftInfo) {
        if (!shiftInfo) return [];

        // 如果是字符串（班次名称），需要从人力配置中推断职能
        if (typeof shiftInfo === 'string') {
            // 简化处理：返回空数组，实际应该从班次配置中获取
            return [];
        }

        // 如果是对象，直接返回functions字段
        if (shiftInfo.functions && Array.isArray(shiftInfo.functions)) {
            return shiftInfo.functions;
        }

        return [];
    },

    /**
     * 获取某职能的每日需求量
     * @param {string} functionId - 职能ID
     * @returns {number} - 每日需求量
     */
    getDailyDemandForFunction(functionId) {
        // 尝试从DailyManpowerManager获取配置
        if (typeof DailyManpowerManager !== 'undefined' && DailyManpowerManager.matrix) {
            // 遍历所有班次和地点，累加该职能的需求
            let totalDemand = 0;
            const shifts = ['A1', 'A', 'A2', 'B1', 'B2'];
            const locations = (typeof DailyManpowerManager !== 'undefined' && Array.isArray(DailyManpowerManager.LOCATIONS) && DailyManpowerManager.LOCATIONS.length > 0)
                ? DailyManpowerManager.LOCATIONS.map(loc => loc.id)
                : ['SH'];

            shifts.forEach(shift => {
                locations.forEach(location => {
                    const key = `${shift}_${location}_${functionId}`;
                    const cell = DailyManpowerManager.matrix[key];

                    if (cell && cell.min !== undefined && cell.min !== null) {
                        totalDemand += cell.min;
                    }
                });
            });

            if (totalDemand > 0) {
                return totalDemand;
            }
        }

        // 如果无法从配置中获取，返回默认值
        const defaultDemands = {
            '网': 10, '天': 5, '微': 5,
            '毛': 2, '银B': 2, '收': 2,
            '星': 3, '追': 2, '综': 2
        };
        return defaultDemands[functionId] || 1;
    },

    /**
     * 获取某月的工作日数量
     * @param {number} month - 月份（1-12）
     * @param {number} year - 年份（可选，默认当年）
     * @returns {number} - 工作日数量
     */
    getWorkDaysCount(month, year = null) {
        if (!year) {
            const scheduleConfig = typeof Store !== 'undefined' ? Store.getState('scheduleConfig') : null;
            year = scheduleConfig ? scheduleConfig.year : new Date().getFullYear();
        }

        // 尝试从SchedulePeriodManager获取准确的工作日数量
        if (typeof SchedulePeriodManager !== 'undefined') {
            // 这里简化处理，实际应该从周期配置中获取
            // 暂时返回一个合理的默认值：每月约22个工作日
            return 22;
        }

        // 简化计算：每月总天数 - 周末天数 - 法定节假日
        const daysInMonth = new Date(year, month, 0).getDate();
        const weekends = this.countWeekends(year, month);

        // 粗略估算：工作日 = 总天数 - 周末 * 0.8（考虑调休）
        return Math.floor(daysInMonth - weekends * 0.8);
    },

    /**
     * 计算某月的周末天数
     * @param {number} year - 年份
     * @param {number} month - 月份
     * @returns {number} - 周末天数
     */
    countWeekends(year, month) {
        let count = 0;
        const daysInMonth = new Date(year, month, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const dayOfWeek = date.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) { // 周日或周六
                count++;
            }
        }

        return count;
    },

    /**
     * 为某一天的某个班次选择最优人员（基于职能均衡）
     * @param {Array} candidates - 候选人员列表（包含staffId, skills, location等）
     * @param {string} shift - 班次（A1/A/A2/B1/B2）
     * @param {string} location - 地点ID
     * @param {string} functionId - 职能ID
     * @param {string} dateStr - 日期字符串
     * @param {number} year - 年份
     * @param {number} month - 月份
     * @param {number} requiredCount - 需要的人数
     * @returns {Array} - 选中的人员列表
     */
    selectOptimalStaffForFunction(
        candidates,
        shift,
        location,
        functionId,
        dateStr,
        year,
        month,
        requiredCount
    ) {
        // 如果职能均衡未启用，直接返回前N名
        if (!this.isEnabled() || !this.isFunctionBalanced(functionId)) {
            return candidates.slice(0, requiredCount);
        }

        if (!candidates || candidates.length === 0) return [];
        if (requiredCount >= candidates.length) return candidates;

        // 计算每个候选人的均衡得分
        const scoredCandidates = candidates.map(candidate => {
            const score = this.calculateBalanceScore(
                candidate.staffId || candidate.id,
                functionId,
                year,
                month
            );

            return {
                ...candidate,
                balanceScore: score
            };
        });

        // 按得分排序（得分高的优先，即目前该职能次数少的人优先）
        scoredCandidates.sort((a, b) => b.balanceScore - a.balanceScore);

        // 取前requiredCount名
        return scoredCandidates.slice(0, requiredCount);
    },

    /**
     * 分析职能均衡状况
     * @param {number} year - 年份
     * @param {number} month - 月份
     * @returns {Object} - 分析结果
     */
    analyzeBalanceStatus(year, month) {
        const rules = this.getRules();
        const staffData = typeof Store !== 'undefined' ? Store.getStaffData() : [];
        const balancedFunctions = rules.balancedFunctions || [];

        const analysis = {
            month: month,
            year: year,
            enabled: rules.enabled,
            strategy: rules.strategy,
            functions: {},
            summary: {
                totalFunctions: balancedFunctions.length,
                balancedFunctions: 0,
                unbalancedFunctions: 0,
                totalStaff: staffData.length,
                monthlyMaxDeviation: rules.monthlyMaxDeviation,
                yearlyMaxDeviation: rules.yearlyMaxDeviation
            }
        };

        // 只分析启用了均衡的职能
        balancedFunctions.forEach(functionId => {
            const functionAnalysis = {
                functionId: functionId,
                monthlyAvg: this.getMonthlyTarget(functionId, month, staffData.length),
                yearlyAvg: this.getYearlyTarget(functionId, staffData.length, year),
                staff: []
            };

            // 统计每个人的该职能次数
            staffData.forEach(staff => {
                const staffId = staff.staffId || staff.id;
                const balance = this.checkFunctionBalance(staffId, functionId, year, month);

                functionAnalysis.staff.push({
                    staffId: staffId,
                    name: staff.name,
                    monthlyCount: balance.monthlyActual,
                    yearlyCount: balance.yearlyActual,
                    monthlyDeviation: balance.monthlyDeviation,
                    yearlyDeviation: balance.yearlyDeviation,
                    isBalanced: balance.isBalanced,
                    isMonthlyBalanced: balance.isMonthlyBalanced,
                    isYearlyBalanced: balance.isYearlyBalanced
                });
            });

            // 判断该职能是否整体均衡（超过20%人员不均衡则视为不均衡）
            const unbalancedCount = functionAnalysis.staff.filter(s => !s.isBalanced).length;
            functionAnalysis.isBalanced = unbalancedCount <= staffData.length * 0.2;
            functionAnalysis.unbalancedStaffCount = unbalancedCount;

            if (functionAnalysis.isBalanced) {
                analysis.summary.balancedFunctions++;
            } else {
                analysis.summary.unbalancedFunctions++;
            }

            analysis.functions[functionId] = functionAnalysis;
        });

        return analysis;
    },

    /**
     * 格式化职能均衡分析报告
     * @param {Object} analysis - analyzeBalanceStatus的返回结果
     * @returns {string} - 格式化的报告文本
     */
    formatBalanceReport(analysis) {
        if (!analysis.enabled) {
            return '职能均衡功能未启用\n';
        }

        let report = `\n========== 职能均衡分析报告 (${analysis.year}年${analysis.month}月) ==========\n`;
        report += `优化策略: ${analysis.strategy === 'strict' ? '严格模式' : '弹性模式'}\n`;
        report += `总人数: ${analysis.summary.totalStaff}\n`;
        report += `均衡职能数: ${analysis.summary.totalFunctions}\n`;
        report += `均衡标准: 月度偏差≤±${analysis.summary.monthlyMaxDeviation}次, 全年偏差≤±${analysis.summary.yearlyMaxDeviation}次\n\n`;

        report += `整体状况:\n`;
        report += `  ✓ 均衡职能: ${analysis.summary.balancedFunctions}\n`;
        report += `  ✗ 不均衡职能: ${analysis.summary.unbalancedFunctions}\n\n`;

        Object.entries(analysis.functions).forEach(([functionId, funcAnalysis]) => {
            report += `【${functionId}职能】\n`;
            report += `  月度人均目标: ${funcAnalysis.monthlyAvg}次\n`;
            report += `  年度人均目标: ${funcAnalysis.yearlyAvg}次\n`;
            report += `  均衡状态: ${funcAnalysis.isBalanced ? '✓ 均衡' : '✗ 不均衡'} (${funcAnalysis.unbalancedStaffCount}人不均衡)\n`;

            // 列出不均衡的人员
            const unbalancedStaff = funcAnalysis.staff.filter(s => !s.isBalanced);
            if (unbalancedStaff.length > 0) {
                report += `  不均衡人员:\n`;
                unbalancedStaff.forEach(staff => {
                    report += `    - ${staff.name}: ` +
                             `本月${staff.monthlyCount}次(${staff.monthlyDeviation >= 0 ? '+' : ''}${staff.monthlyDeviation}), ` +
                             `全年${staff.yearlyCount}次(${staff.yearlyDeviation >= 0 ? '+' : ''}${staff.yearlyDeviation})\n`;
                });
            }
            report += `\n`;
        });

        report += `==========================================\n`;
        return report;
    },

    /**
     * ==========================================
     * 按比例分配的职能均衡算法
     * ==========================================
     * 核心公式：某员工应排某职能次数 = (该员工当月上班天数 / 总工作天数) × 该职能总班次数
     *
     * 示例：
     * - 员工当月上班18天，总工作日910天，网总需求180班次
     * - 应排网 = 18/910 * 180 = 3.5 ≈ 3 或 4 次
     */

    /**
     * 计算个人当月工作日天数（排除大夜和休息日）
     * @param {string} staffId - 人员ID
     * @param {number} year - 年份
     * @param {number} month - 月份
     * @param {Object} schedule - 排班结果
     * @param {Object} personalRequests - 个性化休假需求
     * @returns {number} 工作日天数
     */
    calculatePersonalWorkDays(staffId, year, month, schedule = null, personalRequests = {}) {
        // 获取排班周期
        const scheduleConfig = typeof Store !== 'undefined' ? Store.getState('scheduleConfig') : null;
        if (!scheduleConfig || !scheduleConfig.startDate || !scheduleConfig.endDate) {
            return 0;
        }

        // 生成当月日期列表
        const dateList = this.generateDateListForMonth(year, month);
        if (dateList.length === 0) {
            return 0;
        }

        let workDays = 0;

        dateList.forEach(date => {
            // 检查是否在排班周期内
            if (date < scheduleConfig.startDate || date > scheduleConfig.endDate) {
                return;
            }

            // 检查是否有个性化休假需求（防御性检查）
            if (personalRequests && personalRequests[staffId] && personalRequests[staffId][date] === 'REQ') {
                return; // 这天是休息日
            }

            // 获取排班（防御性检查）
            const shift = schedule && schedule[staffId] ? schedule[staffId][date] : null;

            // 如果没有排班，暂时认为是工作日（未分配）
            if (!shift) {
                return; // 未排班，不计入
            }

            // 排除大夜（NIGHT）和休息日（REST）
            if (shift !== 'NIGHT' && shift !== 'REST') {
                workDays++;
            }
        });

        return workDays;
    },

    /**
     * 计算所有人当月总工作日天数（排除大夜和休息日）
     * @param {number} year - 年份
     * @param {number} month - 月份
     * @param {Object} schedule - 排班结果
     * @param {Object} personalRequests - 个性化休假需求
     * @param {Array} staffData - 人员数据列表（可选，用于计算总工作日）
     * @returns {number} 总工作日天数
     */
    calculateTotalWorkDays(year, month, schedule = null, personalRequests = {}, staffData = null) {
        // 如果传入了staffData，直接使用
        if (staffData && Array.isArray(staffData)) {
            let total = 0;
            staffData.forEach(staff => {
                const staffId = staff.staffId || staff.id;
                total += this.calculatePersonalWorkDays(staffId, year, month, schedule, personalRequests);
            });
            return total;
        }

        // 否则尝试从Store获取
        if (typeof Store !== 'undefined') {
            const currentStaff = Store.getCurrentStaffData();
            if (currentStaff && currentStaff.length > 0) {
                let total = 0;
                currentStaff.forEach(staff => {
                    const staffId = staff.staffId || staff.id;
                    total += this.calculatePersonalWorkDays(staffId, year, month, schedule, personalRequests);
                });
                return total;
            }
        }

        return 0;
    },

    /**
     * 计算当月某职能的总班次数
     * @param {string} functionId - 职能ID
     * @param {number} year - 年份
     * @param {number} month - 月份
     * @returns {number} 该职能当月总班次数
     */
    calculateMonthlyFunctionDemand(functionId, year, month) {
        // 获取排班周期
        const scheduleConfig = typeof Store !== 'undefined' ? Store.getState('scheduleConfig') : null;
        if (!scheduleConfig || !scheduleConfig.startDate || !scheduleConfig.endDate) {
            return 0;
        }

        // 生成当月日期列表
        const dateList = this.generateDateListForMonth(year, month);
        if (dateList.length === 0) {
            return 0;
        }

        // 从DailyManpowerManager获取每日人力配置
        let totalDemand = 0;

        if (typeof DailyManpowerManager !== 'undefined') {
            const shifts = ['A1', 'A', 'A2', 'B1', 'B2'];
            const locations = (typeof DailyManpowerManager !== 'undefined' && Array.isArray(DailyManpowerManager.LOCATIONS) && DailyManpowerManager.LOCATIONS.length > 0)
                ? DailyManpowerManager.LOCATIONS.map(loc => loc.id)
                : ['SH'];

            dateList.forEach(date => {
                // 检查是否在排班周期内
                if (date < scheduleConfig.startDate || date > scheduleConfig.endDate) {
                    return;
                }

                // 检查是否是法定休息日
                const restDays = typeof Store !== 'undefined' ? Store.getAllRestDays() : {};
                if (restDays[date] === true) {
                    return; // 法定休息日，不排班
                }

                // 累加该职能在所有班次和地点的需求
                shifts.forEach(shift => {
                    locations.forEach(location => {
                        const key = `${shift}_${location}_${functionId}`;
                        const cell = DailyManpowerManager.matrix?.[key];

                        if (cell && cell.min !== undefined && cell.min !== null) {
                            totalDemand += cell.min;
                        }
                    });
                });
            });
        }

        return totalDemand;
    },

    /**
     * 计算按比例分配的应排次数
     * 公式：应排次数 = (个人工作日 / 总工作日) × 职能总数
     * @param {string} staffId - 人员ID
     * @param {string} functionId - 职能ID
     * @param {number} year - 年份
     * @param {number} month - 月份
     * @param {Object} schedule - 排班结果
     * @param {Object} personalRequests - 个性化休假需求
     * @param {Array} staffData - 人员数据列表（可选，用于计算总工作日）
     * @returns {Object} {personalWorkDays, totalWorkDays, functionDemand, expectedCount, actualCount, deviation}
     */
    calculateProportionalTarget(staffId, functionId, year, month, schedule = null, personalRequests = {}, staffData = null) {
        // 1. 计算个人工作日
        const personalWorkDays = this.calculatePersonalWorkDays(staffId, year, month, schedule, personalRequests);

        // 2. 计算总工作日
        const totalWorkDays = this.calculateTotalWorkDays(year, month, schedule, personalRequests, staffData);

        // 3. 计算职能总需求
        const functionDemand = this.calculateMonthlyFunctionDemand(functionId, year, month);

        // 4. 计算应排次数
        let expectedCount = 0;
        if (totalWorkDays > 0 && functionDemand > 0) {
            expectedCount = (personalWorkDays / totalWorkDays) * functionDemand;
        }

        // 5. 获取实际已排次数
        const actualCount = this.calculateMonthlyFunctionCount(staffId, year, month, schedule)[functionId] || 0;

        // 6. 计算偏差
        const deviation = actualCount - expectedCount;

        return {
            personalWorkDays,
            totalWorkDays,
            functionDemand,
            expectedCount: parseFloat(expectedCount.toFixed(2)),
            actualCount,
            deviation: parseFloat(deviation.toFixed(2))
        };
    },

    /**
     * 基于按比例分配计算职能均衡得分
     * 得分 = -(实际次数 - 应排次数)，偏差越大得分越低
     * @param {string} staffId - 人员ID
     * @param {Object} requiredFunctions - 需要的职能对象 {网: 2, 天: 1, ...}
     * @param {string} date - 日期 YYYY-MM-DD
     * @param {Object} schedule - 排班结果
     * @param {Object} personalRequests - 个性化休假需求
     * @param {Array} staffData - 人员数据列表（可选，用于计算总工作日）
     * @returns {number} 得分（越低越应该优先分配）
     */
    calculateProportionalBalanceScore(staffId, requiredFunctions, date, schedule, personalRequests, staffData = null) {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;

        let totalScore = 0;
        let functionCount = 0;

        // 遍历所有需要的职能
        Object.entries(requiredFunctions).forEach(([functionId, count]) => {
            if (count <= 0) return;

            // 计算按比例分配的目标
            const target = this.calculateProportionalTarget(
                staffId,
                functionId,
                year,
                month,
                schedule,
                personalRequests,
                staffData
            );

            // 得分 = -(偏差)，偏差越大得分越低
            // 如果已经超过应排次数，得分为负
            const score = -target.deviation;

            totalScore += score;
            functionCount++;
        });

        // 取平均得分
        return functionCount > 0 ? totalScore / functionCount : 0;
    },

    /**
     * 生成当月日期列表
     * @param {number} year - 年份
     * @param {number} month - 月份
     * @returns {Array<string>} 日期列表 YYYY-MM-DD
     */
    generateDateListForMonth(year, month) {
        const dates = [];
        const daysInMonth = new Date(year, month, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
            const monthStr = String(month).padStart(2, '0');
            const dayStr = String(day).padStart(2, '0');
            dates.push(`${year}-${monthStr}-${dayStr}`);
        }

        return dates;
    }
};

// 暴露到全局作用域
if (typeof window !== 'undefined') {
    window.FunctionBalanceManager = FunctionBalanceManager;
}
