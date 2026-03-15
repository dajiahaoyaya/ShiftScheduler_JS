/**
 * 夜班排班算法模块（仅上海地区）
 * 实现夜班排班的各项规则和约束
 *
 * 配置说明：
 * - 使用 NightShiftConfigRules 作为统一配置源
 * - 支持所有配置参数的动态调整
 * - 确保所有约束都能生效
 *
 * ============================================================
 * 约束类型说明：
 * - 【硬约束】（不可违反）：硬上限、每日人数、休假冲突、生理期限制
 * - 【软约束】（尽量满足）：目标天数、连续天数、公平性
 * ============================================================
 *
 * ============================================================
 * 排班结果格式说明：
 * - staff 格式: { staffId: { dateStr: 'NIGHT' } }
 * - date 格式: { dateStr: [{ staffId, name, gender, ... }] }
 * 提供了格式转换方法确保输出格式统一
 * ============================================================
 *
 * @module NightShiftSolver
 */

// 立即执行调试日志（在任何代码之前）
(function() {
    console.log('[NightShiftSolver] ========== 脚本开始执行（立即执行函数） ==========');
    console.log('[NightShiftSolver] 文件位置:', document.currentScript?.src || 'unknown');
})();

// 调试：确认脚本开始执行
console.log('[NightShiftSolver] ========== 脚本开始加载 ==========');

// 添加全局错误捕获
window.addEventListener('error', function(e) {
    if (e.filename && e.filename.includes('nightShift.js')) {
        console.error('[NightShiftSolver] 文件执行出错:', {
            message: e.message,
            filename: e.filename,
            lineno: e.lineno,
            colno: e.colno,
            error: e.error
        });
    }
});

console.log('[NightShiftSolver] 当前 window.NightShiftSolver:', typeof window.NightShiftSolver);

// 检查是否有语法错误
try {
    // 临时保存之前的定义（如果有）
    const prevSolver = window.NightShiftSolver;
    console.log('[NightShiftSolver] 之前的 NightShiftSolver:', prevSolver);
} catch (e) {
    console.error('[NightShiftSolver] 检查时出错:', e);
}

console.log('[NightShiftSolver] 开始定义 NightShiftSolver 对象...');

const NightShiftSolver = {
    /**
     * 算法模式配置
     * - 'legacy': 使用原有的贪心+回溯算法
     * - 'incremental': 使用新的增量渐进式求解算法（从 scheduler-night.js 移植）
     */
    algorithmMode: 'incremental',

    /**
     * 设置算法模式
     * @param {string} mode - 'legacy' | 'incremental'
     */
    setAlgorithmMode(mode) {
        this.algorithmMode = mode;
        console.log(`[NightShiftSolver] 算法模式已切换为: ${mode}`);
    },

    /**
     * 生成夜班排班方案
     *
     * 排班流程（legacy 模式）：
     * 1. 加载配置（统一使用 NightShiftConfigRules）
     * 2. 过滤可用人员（排除哺乳期、孕妇等）
     * 3. 按性别分组
     * 4. 判断人力富足程度
     * 5. 分配夜班（先女后男，按优先级排序）
     * 6. 补漏分配（确保每日最小人数）
     * 7. 验证排班结果
     *
     * 排班流程（incremental 模式）：
     * 1. 委托给 IncrementalNightShiftSolver 执行渐进式求解
     * 2. 返回标准格式结果
     *
     * @param {Object} params - 排班参数
     * @param {Array} params.staffData - 人员数据列表
     * @param {Object} params.scheduleConfig - 排班配置 { startDate, endDate, year, month }
     * @param {Object} params.personalRequests - 个性化休假需求 { "staffId": { "YYYY-MM-DD": "REQ", ... } }
     * @param {Object} params.restDays - 法定休息日配置 { "YYYY-MM-DD": true/false }
     * @param {Object} params.options - 可选参数
     * @param {string} params.options.algorithm - 强制指定算法: 'legacy' | 'incremental'
     * @returns {Object} 排班结果 { schedule: {...}, mandatoryRestDays: {...}, stats: {...} }
     */
    async generateNightShiftSchedule(params) {
        const { staffData, scheduleConfig, personalRequests = {}, restDays = {}, options = {} } = params;

        // 确定使用哪种算法
        const algorithm = options.algorithm || this.algorithmMode;
        const configRules = NightShiftConfigRules.getConfig();

        // 使用增量渐进式求解算法
        if (algorithm === 'incremental') {
            console.log('[NightShiftSolver] 使用 IncrementalNightShiftSolver 渐进式求解算法');

            // 确保 IncrementalNightShiftSolver 已加载
            if (typeof IncrementalNightShiftSolver === 'undefined') {
                console.error('[NightShiftSolver] IncrementalNightShiftSolver 未加载，回退到 legacy 算法');
            } else {
                // 调用增量求解器
                const result = await IncrementalNightShiftSolver.solve({
                    staffData,
                    scheduleConfig,
                    personalRequests,
                    restDays,
                    configRules
                });

                // 添加位置统计（兼容旧格式）
                result.stats.locationCounts = { '上海': result.stats.totalNightShifts };

                // 添加 validation 字段（兼容旧格式）
                result.validation = {
                    isValid: result.stats.errors.length === 0,
                    errors: result.stats.errors,
                    warnings: result.stats.warnings
                };

                return result;
            }
        }

        // 以下是原有的 legacy 算法
        console.log('[NightShiftSolver] 开始生成夜班排班（按地点分配）...');

        // 【重构】统一使用 NightShiftConfigRules 作为配置源
        // 移除 NightShiftRules 兼容层
        console.log('[NightShiftSolver] 使用 NightShiftConfigRules 配置');

        // 生成日期列表
        const dateList = this.generateDateList(scheduleConfig.startDate, scheduleConfig.endDate);

        // 初始化排班结果
        const schedule = {};
        const mandatoryRestDays = {}; // 夜班后必须休息的日期
        const stats = {
            totalNightShifts: 0,
            staffNightShiftCounts: {},
            locationCounts: { '上海': 0 },
            errors: []
        };

        // 1. 获取地点夜班配置（从 DailyManpowerManager）
        const locationConfig = this.getLocationNightShiftConfig();
        console.log('[NightShiftSolver] 地点夜班配置:', locationConfig);

        // 2. 过滤可用人员（排除哺乳期、孕妇等）
        // 【修复】使用 configRules 而不是未定义的 rules
        const constraints = configRules.constraints || {};
        const availableStaff = this.filterAvailableStaff(staffData, {
            lactationPregnancyRestriction: {
                enabled: constraints.checkBasicEligibility !== false
            }
        });

        // 3. 按性别分组（仅上海）
        const shanghaiMaleStaff = availableStaff.filter(s =>
            (s.location === '上海' || s.location === '沪' || s.location === 'SH') &&
            (s.gender === '男' || s.gender === 'M')
        );
        const shanghaiFemaleStaff = availableStaff.filter(s =>
            (s.location === '上海' || s.location === '沪' || s.location === 'SH') &&
            (s.gender === '女' || s.gender === 'F')
        );

        console.log('[NightShiftSolver] 人员分组统计:');
        console.log('  - 上海男性:', shanghaiMaleStaff.length, '人');
        console.log('  - 上海女性:', shanghaiFemaleStaff.length, '人');

        // 4. 为上海分配夜班
        const shanghaiUsedDates = new Set();

        // 4.1 上海地区人力富足判断
        console.log('\n[NightShiftSolver] 判断上海地区人力富足情况...');
        const shanghaiStaff = [...shanghaiMaleStaff, ...shanghaiFemaleStaff];
        const shanghaiScheduleConfig = {
            startDate: scheduleConfig.startDate,
            endDate: scheduleConfig.endDate
        };
        const shanghaiManpowerCheck = this.checkManpowerSufficiency(
            shanghaiStaff,
            shanghaiScheduleConfig,
            { ...locationConfig.shanghai, name: '上海' }
        );

        // 4.2 上海地区夜班分配
        const shanghaiTargetCount = locationConfig.shanghai.max || 2;
        this.assignNightShiftsForLocation(
            schedule,
            mandatoryRestDays,
            shanghaiMaleStaff,
            shanghaiFemaleStaff,
            dateList,
            shanghaiTargetCount,
            '上海',
            shanghaiUsedDates,
            personalRequests,
            restDays,
            configRules,  // 【修复】传入完整的 configRules 而不是 rules
            shanghaiManpowerCheck.isSufficient
        );

        // 5. 统计结果
        this.calculateStats(schedule, stats);

        // 5.1 【新增】确保每日最小人数
        const dailyMin = configRules.regions?.shanghai?.dailyMin || 1;
        const dailyMax = configRules.regions?.shanghai?.dailyMax || 2;
        if (dailyMin > 0) {  // 【修复】改为 dailyMin > 0，确保即使 dailyMin = 1 也会执行补漏
            console.log(`[NightShiftSolver] 执行补漏分配，确保每日至少${dailyMin}人...`);
            const fillResult = this.fillMinimumStaffing(
                schedule,
                mandatoryRestDays,
                availableStaff,
                dateList,
                dailyMin,
                dailyMax,
                '上海',
                personalRequests,
                restDays,
                configRules
            );

            if (fillResult.filledDates.length > 0) {
                console.log(`[NightShiftSolver] 补漏成功: ${fillResult.filledDates.length}人次`);
                fillResult.filledDates.forEach(f => console.log(`  - ${f.dateStr}: ${f.staffId}`));
            }
            if (fillResult.failedDates.length > 0) {
                console.warn(`[NightShiftSolver] 补漏失败: ${fillResult.failedDates.length}天无法满足最小人数`);
                fillResult.failedDates.forEach(f => console.warn(`  - ${f.dateStr}: 还需${f.needed}人`));
                stats.warnings = stats.warnings || [];
                stats.warnings.push(...fillResult.failedDates.map(f => `${f.dateStr}仅能满足${dailyMin - f.needed}人，低于最小要求${dailyMin}人`));
            }
        }

        // 6. 【新增】验证排班结果
        // 【修复】传入 configRules 而不是 rules
        const validation = this.validateNightShiftSchedule(schedule, availableStaff, configRules);
        if (!validation.isValid) {
            console.error('[NightShiftSolver] 排班结果验证失败！');
            validation.errors.forEach(err => console.error('  -', err));
            stats.errors = stats.errors || [];
            stats.errors.push(...validation.errors);
        }
        if (validation.warnings.length > 0) {
            console.warn('[NightShiftSolver] 排班结果有警告：');
            validation.warnings.forEach(warn => console.warn('  -', warn));
            stats.warnings = stats.warnings || [];
            stats.warnings.push(...validation.warnings);
        }

        console.log('[NightShiftSolver] 夜班排班完成');
        console.log('  - 总夜班数:', stats.totalNightShifts);
        console.log('  - 上海夜班数:', stats.locationCounts['上海']);

        return {
            schedule: schedule,
            mandatoryRestDays: mandatoryRestDays,
            stats: stats,
            validation: validation  // 【新增】返回验证结果
        };
    },

    /**
     * 获取地点夜班配置
     */
    getLocationNightShiftConfig() {
        const config = {
            shanghai: { min: 1, max: 2 }
        };

        // 尝试从 DailyManpowerManager 读取配置
        if (typeof DailyManpowerManager !== 'undefined' && DailyManpowerManager.matrix) {
            const matrix = DailyManpowerManager.matrix;

            // 读取上海配置
            const shanghaiCell = matrix['大夜_SH_common'] || matrix['大夜_上海'];
            if (shanghaiCell && shanghaiCell.min !== undefined && shanghaiCell.max !== undefined) {
                config.shanghai = { min: shanghaiCell.min, max: shanghaiCell.max };
            }

            console.log('[NightShiftSolver] 从 DailyManpowerManager 读取配置:', config);
        }

        return config;
    },

    /**
     * 加载上月排班结果
     * @param {Object} scheduleConfig - 当前排班配置
     * @returns {Object|null} 上月排班结果
     */
    loadLastMonthScheduleResult(scheduleConfig) {
        // 计算上月年月
        const currentDate = new Date(scheduleConfig.startDate);
        currentDate.setMonth(currentDate.getMonth() - 1);
        const lastYear = currentDate.getFullYear();
        const lastMonth = String(currentDate.getMonth() + 1).padStart(2, '0');
        const lastYearMonth = `${lastYear}${lastMonth}`;

        // 从Store查找上月结果配置
        const resultConfigs = Store.getScheduleResultConfigs();
        const lastMonthConfig = resultConfigs.find(config => {
            return config.name && config.name.includes(lastYearMonth);
        });

        if (lastMonthConfig && lastMonthConfig.scheduleResultSnapshot) {
            console.log(`[上月数据] 从历史配置加载: ${lastMonthConfig.name}`);
            return lastMonthConfig.scheduleResultSnapshot;
        }

        return null;
    },

    /**
     * 获取上月大夜天数
     * @param {string} staffId - 人员ID
     * @param {Object} scheduleConfig - 当前排班配置
     * @returns {number} 上月大夜天数
     */
    getLastMonthNightShiftDays(staffId, scheduleConfig) {
        // 【重构】统一使用 NightShiftConfigRules
        const lastMonthWeightConfig = NightShiftConfigRules.getLastMonthWeightConfig();
        const dataSource = lastMonthWeightConfig?.dataSource || 'auto';

        // 1. 优先：从历史排班结果统计
        if (dataSource === 'history' || dataSource === 'auto') {
            const lastMonthResult = this.loadLastMonthScheduleResult(scheduleConfig);
            if (lastMonthResult && lastMonthResult.schedule) {
                const staffSchedule = lastMonthResult.schedule[staffId];
                if (staffSchedule) {
                    const days = Object.values(staffSchedule).filter(
                        shift => shift === 'NIGHT'
                    ).length;
                    console.log(`[上月数据] ${staffId} 从历史记录获取: ${days}天`);
                    return days;
                }
            }
        }

        // 2. 其次：使用人员数据的字段
        const staffData = Store.getCurrentStaffData().find(s => s.id === staffId);
        if (staffData && staffData.lastMonthNightShiftDays !== undefined) {
            console.log(`[上月数据] ${staffId} 从人员字段获取: ${staffData.lastMonthNightShiftDays}天`);
            return staffData.lastMonthNightShiftDays;
        }

        // 3. 默认：返回0
        console.log(`[上月数据] ${staffId} 使用默认值: 0天`);
        return 0;
    },

    /**
     * 判断地点人力是否富足
     * @param {Array} locationStaff - 地点人员列表（已按性别分组）
     * @param {Object} scheduleConfig - 排班配置
     * @param {Object} locationConfig - 地点配置 {min, max}
     * @returns {Object} { isSufficient, totalSupply, totalDemand, details }
     */
    checkManpowerSufficiency(locationStaff, scheduleConfig, locationConfig) {
        // 1. 计算排班周期总天数（大夜每天都需有人，包括周末）
        const dateList = this.generateDateList(scheduleConfig.startDate, scheduleConfig.endDate);
        const totalDays = dateList.length;

        // 2. 获取该地点每天的大夜需求人数
        let dailyDemand = locationConfig.min;
        if (dailyDemand === undefined) {
            // 如果locationConfig没有min，从NightShiftConfigRules获取上海地区配置
            if (typeof NightShiftConfigRules !== 'undefined') {
                const regionConfig = NightShiftConfigRules.getRegionConfig('shanghai');
                dailyDemand = regionConfig?.dailyMin || 1;
            } else {
                dailyDemand = 1; // 默认值
            }
        }
        const totalDemand = totalDays * dailyDemand; // 总需求人天数

        // 3. 计算该地点可用人员（排除哺乳期、孕妇）
        const availableStaff = locationStaff.filter(staff => {
            if (staff.isLactating || staff.lactating) return false;
            if (staff.isPregnant || staff.pregnant) return false;
            return true;
        });

        // 4. 按性别统计
        const availableFemales = availableStaff.filter(s => s.gender === '女' || s.gender === 'F').length;
        const availableMales = availableStaff.filter(s => s.gender === '男' || s.gender === 'M').length;

        // 5. 计算总供给人天数（男生4天，女生3天）
        const maleSupply = availableMales * 4;  // 男生每人最多4天
        const femaleSupply = availableFemales * 3;  // 女生每人最多3天
        const totalSupply = maleSupply + femaleSupply;

        // 6. 判断是否富足
        const isSufficient = totalSupply >= totalDemand;

        console.log(`[人力富足判断] ${locationConfig.name || '该地点'}:`);
        console.log(`  总天数: ${totalDays}天, 每日需求: ${dailyDemand}人, 总需求: ${totalDemand}人天`);
        console.log(`  可用男生: ${availableMales}人, 可用女生: ${availableFemales}人`);
        console.log(`  总供给: ${totalSupply}人天 (男生${availableMales}×4 + 女生${availableFemales}×3)`);
        console.log(`  人力${isSufficient ? '富足' : '不足'} (${totalSupply} >= ${totalDemand}: ${isSufficient})`);

        return {
            isSufficient,
            totalSupply,
            totalDemand,
            details: {
                totalDays,
                dailyDemand,
                availableMales,
                availableFemales,
                maleSupply,
                femaleSupply
            }
        };
    },

    /**
     * 应用女生优先3天策略
     * @param {Array} femaleStaff - 女性人员列表
     * @param {Object} personalRequests - 休假需求
     * @param {boolean} isManpowerSufficient - 人力是否富足
     * @param {Object} scheduleConfig - 排班配置（用于获取上月数据）
     * @returns {Array} 分配结果 [{ staffId, targetDays, priority, lastMonthDays }]
     */
    applyFemalePriorityStrategy(femaleStaff, personalRequests, isManpowerSufficient, scheduleConfig) {
        const config = this.getFemalePriorityConfig();

        // 不启用或人力不足时，所有女生按默认天数
        if (!config.enabled || (config.applyCondition === 'sufficient' && !isManpowerSufficient)) {
            return femaleStaff.map(staff => ({
                staffId: staff.id,
                targetDays: config.normalDays || 4,
                priority: 0,
                lastMonthDays: 0
            }));
        }

        // 按上月大夜天数降序排序（天数多的优先）
        const sorted = [...femaleStaff].sort((a, b) => {
            const aDays = this.getLastMonthNightShiftDays(a.id, scheduleConfig);
            const bDays = this.getLastMonthNightShiftDays(b.id, scheduleConfig);
            return bDays - aDays;
        });

        // 获取女生硬上限
        const regionConfig = this.getRegionConfig('shanghai');
        const femaleMaxDays = regionConfig?.femaleMaxDaysPerMonth || 3;

        // 上月天数>=阈值的女生排减少天数，其他排正常天数
        // 【关键修复】确保目标天数不超过硬上限（女生硬上限是3天）
        return sorted.map(staff => {
            const lastMonthDays = this.getLastMonthNightShiftDays(staff.id, scheduleConfig);
            const shouldReduce = lastMonthDays >= (config.minLastMonthDays || 4);
            
            // 计算目标天数
            let targetDays = shouldReduce ?
                (config.reducedDays || 3) :
                (config.normalDays || 4);
            
            // 【关键修复】女生硬上限是3天，目标天数不能超过硬上限
            targetDays = Math.min(targetDays, femaleMaxDays);

            return {
                staffId: staff.id,
                targetDays: targetDays,
                priority: shouldReduce ? 100 : 50,
                lastMonthDays: lastMonthDays
            };
        });
    },

    /**
     * 检测休假冲突
     * @param {Object} personalRequests - 某员工的休假需求
     * @param {string} dateStr - 日期字符串
     * @returns {boolean} 是否冲突
     *
     * 【硬约束】休假冲突检查是硬约束，不可违反
     */
    checkVacationConflict(personalRequests, dateStr) {
        // 【重构】统一使用 NightShiftConfigRules
        const config = NightShiftConfigRules.getVacationConflictConfig();

        if (!config.enabled) {
            return false;
        }

        const vacationType = personalRequests[dateStr];

        // A部分：ANNUAL/SICK必须避开（严格模式）
        if (config.strictMode && (vacationType === 'ANNUAL' || vacationType === 'SICK')) {
            console.log(`[休假冲突] ${dateStr} 有${vacationType}，跳过`);
            return true;
        }

        // B部分：LEGAL必须避开
        if (config.legalVacationSkip && vacationType === 'LEGAL') {
            console.log(`[休假冲突] ${dateStr} 有法定休，跳过`);
            return true;
        }

        // B部分：REQ必须避开
        if (config.reqVacationSkip && vacationType === 'REQ') {
            console.log(`[休假冲突] ${dateStr} 有指定休假，跳过`);
            return true;
        }

        return false;
    },

    /**
     * 统计某个人员已分配的大夜天数
     * @param {Object} schedule - 排班表
     * @param {string} staffId - 人员ID
     * @returns {number} 已分配的大夜天数
     */
    countAssignedNightShifts(schedule, staffId) {
        if (!schedule[staffId]) {
            return 0;
        }
        return Object.values(schedule[staffId]).filter(v => v === 'NIGHT').length;
    },

    /**
     * 为指定地点分配夜班（增强版：接收分开的男女生员工和人力富足标志）
     */
    assignNightShiftsForLocation(
        schedule,
        mandatoryRestDays,
        maleStaff,
        femaleStaff,
        dateList,
        targetCount,
        location,
        usedDates,
        personalRequests,
        restDays,
        rules,
        isManpowerSufficient
    ) {
        console.log(`[NightShiftSolver] 为${location}分配夜班，目标人数:`, targetCount);

        if (maleStaff.length === 0 && femaleStaff.length === 0) {
            console.warn(`[NightShiftSolver] ${location}没有可用人员`);
            return;
        }

        console.log(`[NightShiftSolver] ${location}人力${isManpowerSufficient ? '富足' : '不足'}`);

        // 【新增】步骤1：应用女生优先3天策略
        const scheduleConfig = { startDate: dateList[0].dateStr, endDate: dateList[dateList.length - 1].dateStr };
        const femaleAssignments = this.applyFemalePriorityStrategy(
            femaleStaff,
            personalRequests,
            isManpowerSufficient,
            scheduleConfig
        );

        // 【新增】步骤2：男生分配（按上月权重排序）
        // 【修复】从 configRules 正确获取目标天数
        const regionConfig = NightShiftConfigRules.getRegionConfig('shanghai');
        const maleAssignments = maleStaff.map(staff => {
            const lastMonthDays = this.getLastMonthNightShiftDays(staff.id, scheduleConfig);
            // 使用人力计算配置中的标准天数，而不是连续天数
            const manpowerConfig = NightShiftConfigRules.getManpowerCalculationConfig();
            const targetDays = manpowerConfig.maleDaysPerMonth || 4;
            return {
                staffId: staff.id,
                targetDays: targetDays,
                priority: lastMonthDays >= 4 ? 30 : 10,
                lastMonthDays: lastMonthDays
            };
        });

        // 【新增】步骤3：合并并按优先级排序
        const allAssignments = [...femaleAssignments, ...maleAssignments]
            .sort((a, b) => b.priority - a.priority);

        console.log(`[NightShiftSolver] ${location}人员分配计划:`,
            allAssignments.map(a => ({
                id: a.staffId,
                days: a.targetDays,
                lastMonth: a.lastMonthDays,
                priority: a.priority
            }))
        );

        // 【修改】步骤4：按优先级和目标天数分配
        // 【关键修复】移除assignedCount限制，让所有员工都有机会分配
        // targetCount应该在每天的人数检查中体现，而不是限制总分配人数
        let assignedCount = 0; // 统计实际分配的人员数量

        for (const assignment of allAssignments) {
            // 从男女生列表中找到员工
            const staff = [...maleStaff, ...femaleStaff].find(s => s.id === assignment.staffId);
            if (!staff) {
                console.warn(`[NightShiftSolver] ${location}找不到员工: ${assignment.staffId}`);
                continue;
            }

            const staffId = staff.staffId || staff.id;

            if (!schedule[staffId]) {
                schedule[staffId] = {};
            }
            if (!mandatoryRestDays[staffId]) {
                mandatoryRestDays[staffId] = [];
            }

            // 使用策略计算的目标天数
            const targetDays = assignment.targetDays;
            
            // 【关键修复】获取硬上限（maxDaysPerMonth）
            // 从配置中获取，如果没有配置则使用默认值
            let maxDaysPerMonth;
            if (typeof NightShiftConfigRules !== 'undefined') {
                const regionConfig = NightShiftConfigRules.getRegionConfig('shanghai');
                maxDaysPerMonth = staff.gender === '女' 
                    ? (regionConfig?.femaleMaxDaysPerMonth || 3)
                    : (regionConfig?.maleMaxDaysPerMonth || 4);
            } else {
                // 【修复】如果没有配置，使用默认值
                maxDaysPerMonth = staff.gender === '女' ? 3 : 4;
            }

            // 【关键修复】检查这个人已经排了多少天大夜
            const alreadyAssigned = this.countAssignedNightShifts(schedule, staffId);
            
            // 【关键修复】双重检查：先检查硬上限（绝对不可违反）
            if (alreadyAssigned >= maxDaysPerMonth) {
                console.log(`[NightShiftSolver] ${staff.name}已分配${alreadyAssigned}天，达到硬上限${maxDaysPerMonth}天，跳过`);
                continue;
            }
            
            // 再检查目标天数（软目标）
            if (alreadyAssigned >= targetDays) {
                console.log(`[NightShiftSolver] ${staff.name}已分配${alreadyAssigned}天，达到目标${targetDays}天，跳过`);
                continue;
            }

            // 计算还需要分配的天数（不能超过硬上限）
            const remainingDays = Math.min(targetDays - alreadyAssigned, maxDaysPerMonth - alreadyAssigned);
            console.log(`[NightShiftSolver] ${staff.name}已分配${alreadyAssigned}天，目标${targetDays}天，硬上限${maxDaysPerMonth}天，还需${remainingDays}天`);

            if (remainingDays <= 0) {
                continue;
            }

            // 检查生理期限制
            // 【修复】从 configRules 获取配置
            const menstrualPeriod = this.getMenstrualPeriod(staff, dateList, {
                menstrualPeriodRestriction: {
                    enabled: rules.constraints?.checkMenstrualPeriod !== false
                }
            });

            // 获取最大连续天数限制
            // 【修复】从 configRules 正确获取连续天数
            const regionConfig = NightShiftConfigRules.getRegionConfig('shanghai');
            const maxConsecutiveDays = staff.gender === '女' 
                ? (regionConfig?.femaleConsecutiveDays || 3)
                : (regionConfig?.maleConsecutiveDays || 4);
            console.log(`[NightShiftSolver] ${staff.name}最大连续天数限制: ${maxConsecutiveDays}天`);

            // 查找可用的连续日期段（使用剩余需要天数和最大连续天数限制）
            const availablePeriod = this.findAvailableContinuousPeriod(
                dateList,
                remainingDays,
                personalRequests[staffId] || {},
                restDays,
                menstrualPeriod,
                usedDates,
                schedule[staffId],
                mandatoryRestDays[staffId],
                maxConsecutiveDays,  // 传入最大连续天数限制
                schedule,  // 传入完整排班表，用于检查每天人数
                targetCount,  // 传入每天最大人数限制
                location,  // 传入地点，用于检查该地点的人数
                maxDaysPerMonth,  // 【新增】传入总天数硬上限
                alreadyAssigned  // 【新增】传入已分配天数
            );

            if (availablePeriod) {
                // 【关键修复】分配前再次检查：确保分配后不超过硬上限
                const daysToAssign = availablePeriod.length;
                if (alreadyAssigned + daysToAssign > maxDaysPerMonth) {
                    console.warn(`[NightShiftSolver] ${staff.name}分配${daysToAssign}天后将超过硬上限${maxDaysPerMonth}天（当前${alreadyAssigned}天），调整分配天数`);
                    // 调整分配天数，只分配不超过硬上限的部分
                    const adjustedDays = maxDaysPerMonth - alreadyAssigned;
                    if (adjustedDays > 0) {
                        availablePeriod.slice(0, adjustedDays).forEach(dateStr => {
                            schedule[staffId][dateStr] = 'NIGHT';
                            usedDates.add(dateStr);
                            this.addMandatoryRestDaysAfterNightShift(
                                mandatoryRestDays[staffId],
                                dateStr,
                                dateList
                            );
                        });
                        assignedCount++;
                        console.log(`[NightShiftSolver] ${location}已分配夜班给:`, staff.name,
                            `(${adjustedDays}天，已调整，上月${assignment.lastMonthDays}天, 优先级${assignment.priority})`);
                    } else {
                        console.warn(`[NightShiftSolver] ${staff.name}已达到硬上限，无法再分配`);
                    }
                } else {
                    // 正常分配
                    availablePeriod.forEach(dateStr => {
                        schedule[staffId][dateStr] = 'NIGHT';
                        usedDates.add(dateStr);
                        this.addMandatoryRestDaysAfterNightShift(
                            mandatoryRestDays[staffId],
                            dateStr,
                            dateList
                        );
                    });
                    
                    // 【关键修复】分配后验证
                    const newAssigned = this.countAssignedNightShifts(schedule, staffId);
                    if (newAssigned > maxDaysPerMonth) {
                        console.error(`[严重错误] ${staff.name}分配后超过硬上限！已分配${newAssigned}天，上限${maxDaysPerMonth}天`);
                        // 回滚：删除最后分配的天数
                        availablePeriod.forEach(dateStr => {
                            delete schedule[staffId][dateStr];
                            usedDates.delete(dateStr);
                        });
                        console.error(`[回滚] ${staff.name}的分配已回滚`);
                    } else {
                        assignedCount++;
                        console.log(`[NightShiftSolver] ${location}已分配夜班给:`, staff.name,
                            `(${availablePeriod.length}天, 上月${assignment.lastMonthDays}天, 优先级${assignment.priority})`);
                    }
                }
            } else {
                // 如果找不到连续日期段，尝试分散分配（使用剩余需要天数）
                // 使用当前函数已传入的 rules 配置
                const constraints = rules.constraints || {};
                const assignedDates = this.assignDistributedForStaff(
                    schedule,
                    mandatoryRestDays,
                    staff,
                    dateList,
                    remainingDays,
                    personalRequests,
                    restDays,
                    {
                        // 构造兼容的 rules 格式
                        continuousNightShift: {
                            arrangementMode: constraints.arrangementMode || 'continuous',
                            minIntervalDays: constraints.minIntervalDays || 7
                        },
                        menstrualPeriodRestriction: {
                            enabled: constraints.checkMenstrualPeriod !== false
                        }
                    },
                    usedDates,
                    constraints.minIntervalDays || 7,  // minIntervalDays
                    targetCount,  // maxPeoplePerDay
                    location  // location
                );

                if (assignedDates.length > 0) {
                    assignedCount++;
                    console.log(`[NightShiftSolver] ${location}已分配分散夜班给:`, staff.name,
                        `(${assignedDates.length}天, 上月${assignment.lastMonthDays}天)`);
                }
            }
        }

        console.log(`[NightShiftSolver] ${location}实际分配:`, assignedCount, '人');
    },

    /**
     * 为单个人员分配分散大夜
     * @param {Object} schedule - 排班表
     * @param {Object} mandatoryRestDays - 必须休息的日期
     * @param {Object} staff - 员工对象
     * @param {Array} dateList - 日期列表
     * @param {number} requiredDays - 需要的天数
     * @param {Object} personalRequests - 个性化休假需求
     * @param {Object} restDays - 休息日配置
     * @param {Object} rules - 规则配置
     * @param {Set} usedDates - 已分配的日期
     * @param {number} minIntervalDays - 最小间隔天数
     * @param {number} maxPeoplePerDay - 每天最大人数限制
     * @param {string} location - 地点
     */
    assignDistributedForStaff(schedule, mandatoryRestDays, staff, dateList, requiredDays, personalRequests, restDays, rules, usedDates, minIntervalDays = 7, maxPeoplePerDay = 2, location = null) {
        const staffId = staff.staffId || staff.id;
        const staffRequests = personalRequests[staffId] || {};

        // 【关键修复】获取硬上限（maxDaysPerMonth）
        let maxDaysPerMonth;
        if (typeof NightShiftConfigRules !== 'undefined') {
            const regionConfig = NightShiftConfigRules.getRegionConfig('shanghai');
            maxDaysPerMonth = staff.gender === '女' 
                ? (regionConfig?.femaleMaxDaysPerMonth || 3)
                : (regionConfig?.maleMaxDaysPerMonth || 4);
        } else {
            // 【修复】如果没有配置，使用默认值
            maxDaysPerMonth = staff.gender === '女' ? 3 : 4;
        }
        
        // 【关键修复】检查这个人已经排了多少天大夜
        const alreadyAssigned = this.countAssignedNightShifts(schedule, staffId);
        
        // 【关键修复】双重检查：先检查硬上限（绝对不可违反）
        if (alreadyAssigned >= maxDaysPerMonth) {
            console.log(`[NightShiftSolver] ${staff.name}已分配${alreadyAssigned}天，达到硬上限${maxDaysPerMonth}天，跳过分散分配`);
            return [];
        }
        
        // 再检查目标天数（软目标）
        if (alreadyAssigned >= requiredDays) {
            console.log(`[NightShiftSolver] ${staff.name}已分配${alreadyAssigned}天，达到目标${requiredDays}天，跳过分散分配`);
            return [];
        }

        // 计算还需要分配的天数（不能超过硬上限）
        const remainingDays = Math.min(requiredDays - alreadyAssigned, maxDaysPerMonth - alreadyAssigned);
        console.log(`[NightShiftSolver] ${staff.name}已分配${alreadyAssigned}天，目标${requiredDays}天，硬上限${maxDaysPerMonth}天，还需分散分配${remainingDays}天`);

        if (remainingDays <= 0) {
            return [];
        }

        // 检查生理期限制
        // 【修复】从 configRules 获取配置
        const constraints = typeof NightShiftConfigRules !== 'undefined' 
            ? NightShiftConfigRules.getConstraintsConfig() 
            : {};
        const menstrualPeriod = this.getMenstrualPeriod(staff, dateList, {
            menstrualPeriodRestriction: {
                enabled: constraints.checkMenstrualPeriod !== false
            }
        });

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
            // 排除休假冲突（ANNUAL/SICK/LEGAL/REQ）
            if (this.checkVacationConflict(staffRequests, dateStr)) {
                return false;
            }
            // 排除生理期
            if (menstrualPeriod.has(dateStr)) {
                return false;
            }
            // 【关键修复】检查该日期的人数是否已达到限制
            if (maxPeoplePerDay && location) {
                const currentCount = this.countPeopleOnDate(schedule, dateStr, location);
                if (currentCount >= maxPeoplePerDay) {
                    console.log(`[分散分配] ${dateStr} ${location}已有${currentCount}人，达到限制${maxPeoplePerDay}人，跳过`);
                    return false;
                }
            }
            // 排除这个人已有的排班（避免重复）
            if (schedule[staffId] && schedule[staffId][dateStr]) {
                return false;
            }
            return true;
        });

        // 按最小间隔分配（使用剩余需要天数）
        const assignedDates = [];
        let lastAssignedIndex = -minIntervalDays - 1;

        for (let i = 0; i < availableDates.length && assignedDates.length < remainingDays; i++) {
            const currentIndex = dateList.findIndex(d => d.dateStr === availableDates[i].dateStr);

            // 检查是否满足最小间隔
            if (currentIndex - lastAssignedIndex >= minIntervalDays) {
                assignedDates.push(availableDates[i].dateStr);
                lastAssignedIndex = currentIndex;
            }
        }

        // 如果无法满足最小间隔，放宽限制
        if (assignedDates.length < remainingDays) {
            for (let i = 0; i < availableDates.length && assignedDates.length < remainingDays; i++) {
                const dateStr = availableDates[i].dateStr;
                if (!assignedDates.includes(dateStr)) {
                    assignedDates.push(dateStr);
                }
            }
        }

        // 【关键修复】分配前再次检查：确保分配后不超过硬上限
        const daysToAssign = assignedDates.length;
        if (alreadyAssigned + daysToAssign > maxDaysPerMonth) {
            console.warn(`[NightShiftSolver] ${staff.name}分散分配${daysToAssign}天后将超过硬上限${maxDaysPerMonth}天（当前${alreadyAssigned}天），调整分配天数`);
            // 调整分配天数，只分配不超过硬上限的部分
            const adjustedDays = maxDaysPerMonth - alreadyAssigned;
            assignedDates.slice(0, adjustedDays).forEach(dateStr => {
                schedule[staffId][dateStr] = 'NIGHT';
                usedDates.add(dateStr);
                this.addMandatoryRestDaysAfterNightShift(
                    mandatoryRestDays[staffId],
                    dateStr,
                    dateList
                );
            });
            // 返回实际分配的天数
            return assignedDates.slice(0, adjustedDays);
        }
        
        // 正常分配
        assignedDates.forEach(dateStr => {
            schedule[staffId][dateStr] = 'NIGHT';
            usedDates.add(dateStr);

            // 记录夜班后必须休息的日期（2天）
            this.addMandatoryRestDaysAfterNightShift(
                mandatoryRestDays[staffId],
                dateStr,
                dateList
            );
        });
        
        // 【关键修复】分配后验证
        const newAssigned = this.countAssignedNightShifts(schedule, staffId);
        if (newAssigned > maxDaysPerMonth) {
            console.error(`[严重错误] ${staff.name}分散分配后超过硬上限！已分配${newAssigned}天，上限${maxDaysPerMonth}天`);
            // 回滚：删除最后分配的天数
            assignedDates.forEach(dateStr => {
                delete schedule[staffId][dateStr];
                usedDates.delete(dateStr);
            });
            console.error(`[回滚] ${staff.name}的分散分配已回滚`);
            return [];
        }

        return assignedDates;
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
     * 添加夜班后必须休息的日期
     */
    addMandatoryRestDaysAfterNightShift(mandatoryRestList, nightShiftDate, dateList) {
        const nightIndex = dateList.findIndex(d => d.dateStr === nightShiftDate || d === nightShiftDate);
        if (nightIndex === -1) return;

        // 从配置获取夜班后强制休息天数
        let postShiftRestDays = 2; // 默认值
        if (typeof NightShiftConfigRules !== 'undefined') {
            const strictConfig = NightShiftConfigRules.getStrictContinuousConfig();
            postShiftRestDays = strictConfig.postShiftRestDays || 2;
        }

        for (let i = 1; i <= postShiftRestDays; i++) {
            const nextIndex = nightIndex + i;
            if (nextIndex < dateList.length) {
                const nextDate = dateList[nextIndex];
                const dateStr = nextDate.dateStr || nextDate;
                if (!mandatoryRestList.includes(dateStr)) {
                    mandatoryRestList.push(dateStr);
                }
            }
        }
    },

    /**
     * 获取生理期时间段
     */
    getMenstrualPeriod(staff, dateList, rules) {
        const menstrualDates = new Set();

        if (!rules.menstrualPeriodRestriction.enabled) {
            return menstrualDates;
        }

        const menstrualPeriod = staff.menstrualPeriod || staff.menstrualPeriodType;

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
     * 查找可用的连续日期段（增强版：确保不超过最大连续天数限制和每天人数限制）
     * @param {Array} dateList - 日期列表
     * @param {number} continuousDays - 需要的连续天数
     * @param {number} maxConsecutiveDays - 最大连续天数限制（例如4天）
     * @param {Object} personalRequests - 个性化休假需求
     * @param {Object} restDays - 休息日配置
     * @param {Set} menstrualPeriod - 生理期日期集合
     * @param {Set} usedDates - 已分配的日期（用于快速判断）
     * @param {Object} existingSchedule - 已有的排班表
     * @param {Array} mandatoryRestList - 必须休息的日期列表
     * @param {Object} fullSchedule - 完整排班表（用于检查每天人数）
     * @param {number} maxPeoplePerDay - 每天最大人数限制
     * @param {string} location - 地点（用于检查该地点的人数）
     * @param {number} maxTotalDays - 总天数硬上限（新增参数）
     * @param {number} alreadyAssigned - 已分配天数（新增参数）
     * @returns {Array|null} 可用的连续日期段，长度不超过 continuousDays 和 maxConsecutiveDays
     */
    findAvailableContinuousPeriod(dateList, continuousDays, personalRequests, restDays, menstrualPeriod, usedDates, existingSchedule = null, mandatoryRestList = null, maxConsecutiveDays = 7, fullSchedule = null, maxPeoplePerDay = 2, location = null, maxTotalDays = null, alreadyAssigned = 0) {
        // 【关键修复】确保不超过最大连续天数限制，同时不超过总天数硬上限
        let daysToFind = Math.min(continuousDays, maxConsecutiveDays);
        if (maxTotalDays !== null && alreadyAssigned !== null) {
            // 如果指定了总天数硬上限，确保分配后不超过硬上限
            const remainingQuota = maxTotalDays - alreadyAssigned;
            daysToFind = Math.min(daysToFind, remainingQuota);
        }
        
        if (daysToFind <= 0) {
            console.log(`[连续日期查找] 无法分配：连续天数${continuousDays}，最大连续${maxConsecutiveDays}，硬上限${maxTotalDays}，已分配${alreadyAssigned}`);
            return null;
        }

        for (let i = 0; i <= dateList.length - daysToFind; i++) {
            const period = dateList.slice(i, i + daysToFind);
            let isValid = true;

            for (const dateInfo of period) {
                const dateStr = dateInfo.dateStr || dateInfo;

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

                // 检查休假冲突（ANNUAL/SICK/LEGAL/REQ）
                if (this.checkVacationConflict(personalRequests, dateStr)) {
                    isValid = false;
                    console.log(`[连续日期查找] ${dateStr} 休假冲突，跳过该段`);
                    break;
                }

                // 检查是否生理期
                if (menstrualPeriod.has(dateStr)) {
                    isValid = false;
                    break;
                }

                // 【关键修复】检查该日期该地点的人数是否已达到限制
                if (fullSchedule && maxPeoplePerDay && location) {
                    const currentCount = this.countPeopleOnDate(fullSchedule, dateStr, location);
                    if (currentCount >= maxPeoplePerDay) {
                        isValid = false;
                        console.log(`[连续日期查找] ${dateStr} ${location}已有${currentCount}人，达到限制${maxPeoplePerDay}人，跳过该段`);
                        break;
                    }
                }

                // 检查是否已有排班
                if (existingSchedule && existingSchedule[dateStr]) {
                    isValid = false;
                    break;
                }

                // 检查是否在必须休息日列表中
                if (mandatoryRestList && mandatoryRestList.includes(dateStr)) {
                    isValid = false;
                    break;
                }
            }

            if (isValid) {
                return period.map(d => d.dateStr || d);
            }
        }

        return null;
    },

    /**
     * 【新增】补漏分配：确保每日最小人数
     * @param {Object} schedule - 排班表
     * @param {Object} mandatoryRestDays - 强制休息日
     * @param {Array} availableStaff - 可用员工列表
     * @param {Array} dateList - 日期列表
     * @param {number} dailyMin - 每日最小人数
     * @param {number} dailyMax - 每日最大人数
     * @param {string} location - 地点
     * @param {Object} personalRequests - 个性化休假
     * @param {Object} restDays - 休息日配置
     * @param {Object} configRules - 配置规则（NightShiftConfigRules 格式）
     * @returns {Object} { filledDates, failedDates }
     */
    fillMinimumStaffing(schedule, mandatoryRestDays, availableStaff, dateList, dailyMin, dailyMax, location, personalRequests, restDays, configRules) {
        const filledDates = [];
        const failedDates = [];
        const staffSet = [...availableStaff];

        // 【修复】从配置获取硬上限
        const regionConfig = configRules.regions?.shanghai || {};
        const maleMaxDays = regionConfig.maleMaxDaysPerMonth || 4;
        const femaleMaxDays = regionConfig.femaleMaxDaysPerMonth || 3;

        // 统计当前每日的已分配人数
        const currentCounts = {};
        dateList.forEach(d => currentCounts[d.dateStr] = 0);
        Object.entries(schedule).forEach(([staffId, dates]) => {
            Object.keys(dates).forEach(dateStr => {
                if (dates[dateStr] === 'NIGHT' && currentCounts[dateStr] !== undefined) {
                    currentCounts[dateStr]++;
                }
            });
        });

        // 找出需要补人的日期
        const datesNeedingStaff = dateList.filter(d => currentCounts[d.dateStr] < dailyMin);

        for (const dateInfo of datesNeedingStaff) {
            const dateStr = dateInfo.dateStr;
            let needed = dailyMin - currentCounts[dateStr];

            // 按优先级排序可用员工
            const eligibleStaff = staffSet.filter(staff => {
                const staffId = staff.staffId || staff.id;
                // 检查是否已有排班
                if (schedule[staffId]?.[dateStr]) return false;
                // 检查是否在强制休息日
                if (mandatoryRestDays[staffId]?.includes(dateStr)) return false;
                // 检查休假冲突
                if (this.checkVacationConflict(personalRequests[staffId] || {}, dateStr)) return false;
                // 【修复】检查是否超过月度硬上限（从配置获取）
                const alreadyAssigned = this.countAssignedNightShifts(schedule, staffId);
                const maxDays = staff.gender === '女' ? femaleMaxDays : maleMaxDays;
                if (alreadyAssigned >= maxDays) {
                    console.log(`[fillMinimumStaffing] ${staff.name}已分配${alreadyAssigned}天，达到硬上限${maxDays}天，跳过`);
                    return false;
                }
                return true;
            });

            // 按上月大夜天数排序（少的优先）
            eligibleStaff.sort((a, b) => {
                const aLast = this.getLastMonthNightShiftDays(a.id, { startDate: dateList[0].dateStr, endDate: dateList[dateList.length-1].dateStr });
                const bLast = this.getLastMonthNightShiftDays(b.id, { startDate: dateList[0].dateStr, endDate: dateList[dateList.length-1].dateStr });
                return aLast - bLast;
            });

            // 分配
            for (const staff of eligibleStaff) {
                if (needed <= 0) break;
                const staffId = staff.staffId || staff.id;

                if (!schedule[staffId]) schedule[staffId] = {};
                schedule[staffId][dateStr] = 'NIGHT';
                if (!mandatoryRestDays[staffId]) mandatoryRestDays[staffId] = [];
                this.addMandatoryRestDaysAfterNightShift(mandatoryRestDays[staffId], dateStr, dateList);

                currentCounts[dateStr]++;
                needed--;
                filledDates.push({ dateStr, staffId });
            }

            if (needed > 0) {
                failedDates.push({ dateStr, needed });
            }
        }

        return { filledDates, failedDates };
    },

    /**
     * 统计某天某地点的大夜人数
     * @param {Object} schedule - 排班表 { staffId: { dateStr: 'NIGHT' } }
     * @param {string} dateStr - 日期字符串
     * @param {string} location - 地点
     * @returns {number} 该天该地点的大夜人数
     */
    countPeopleOnDate(schedule, dateStr, location) {
        let count = 0;

        // 遍历所有员工的排班，统计在该日期被分配大夜的人数
        for (const staffId in schedule) {
            const staffSchedule = schedule[staffId];
            if (staffSchedule[dateStr] === 'NIGHT') {
                count++;
            }
        }

        return count;
    },

    /**
     * 统计排班结果
     */
    calculateStats(schedule, stats) {
        Object.keys(schedule).forEach(staffId => {
            const nightShifts = Object.values(schedule[staffId]).filter(v => v === 'NIGHT').length;
            stats.staffNightShiftCounts[staffId] = nightShifts;
            stats.totalNightShifts += nightShifts;

            // 按地点统计（需要从人员数据中获取地点信息）
            // 这里简化处理，实际使用时可以根据需要扩展
        });
    },

    /**
     * 验证大夜排班结果（检查硬上限、每天人数、连续天数等）
     * @param {Object} schedule - 排班表 { staffId: { dateStr: 'NIGHT' } }
     * @param {Array} staffData - 人员数据
     * @param {Object} configRules - 配置规则（NightShiftConfigRules 格式）
     * @returns {Object} { errors: [], warnings: [], isValid: boolean }
     */
    validateNightShiftSchedule(schedule, staffData, configRules) {
        const errors = [];
        const warnings = [];
        
        console.log('[NightShiftSolver] 开始验证大夜排班结果...');
        
        // 获取配置
        let maleMaxDays = 4;
        let femaleMaxDays = 3;
        if (typeof NightShiftConfigRules !== 'undefined') {
            const regionConfig = NightShiftConfigRules.getRegionConfig('shanghai');
            maleMaxDays = regionConfig?.maleMaxDaysPerMonth || 4;
            femaleMaxDays = regionConfig?.femaleMaxDaysPerMonth || 3;
        }
        
        // 1. 检查硬上限
        staffData.forEach(staff => {
            const staffId = staff.id || staff.staffId;
            if (!schedule[staffId]) {
                return;
            }
            
            const maxDays = staff.gender === '男' || staff.gender === 'M' ? maleMaxDays : femaleMaxDays;
            const assigned = this.countAssignedNightShifts(schedule, staffId);
            
            if (assigned > maxDays) {
                errors.push(`${staff.name || staffId}分配了${assigned}天大夜，超过硬上限${maxDays}天`);
                console.error(`[验证错误] ${staff.name || staffId}分配了${assigned}天大夜，超过硬上限${maxDays}天`);
            } else if (assigned === maxDays) {
                console.log(`[验证通过] ${staff.name || staffId}分配了${assigned}天大夜，达到硬上限${maxDays}天`);
            }
        });
        
        // 2. 检查每天人数
        const dateCounts = {};
        Object.entries(schedule).forEach(([staffId, dates]) => {
            Object.keys(dates).forEach(date => {
                if (dates[date] === 'NIGHT') {
                    dateCounts[date] = (dateCounts[date] || 0) + 1;
                }
            });
        });
        
        // 2.1 【新增】检查每天人数是否满足最小值
        const dailyRegionConfig = typeof NightShiftConfigRules !== 'undefined' 
            ? NightShiftConfigRules.getRegionConfig('shanghai') 
            : null;
        const dailyMin = dailyRegionConfig?.dailyMin || 1;

        Object.entries(dateCounts).forEach(([date, count]) => {
            if (count < dailyMin) {
                errors.push(`${date}只有${count}人大夜，低于最小要求${dailyMin}人`);
                console.error(`[验证错误] ${date}只有${count}人大夜，低于最小要求${dailyMin}人`);
            }
        });

        // 2.2 检查是否超过最大值
        Object.entries(dateCounts).forEach(([date, count]) => {
            // 从配置获取跨地区最大总人数
            let maxTotal = 4; // 默认值
            if (typeof NightShiftConfigRules !== 'undefined') {
                const crossRegionConfig = NightShiftConfigRules.getCrossRegionConfig();
                maxTotal = crossRegionConfig.totalDailyMax || 4;
            }
            if (count > maxTotal) {
                warnings.push(`${date}有${count}人大夜，超过跨地区最大总人数${maxTotal}人`);
                console.warn(`[验证警告] ${date}有${count}人大夜，超过跨地区最大总人数${maxTotal}人`);
            }
        });
        
        // 3. 检查连续天数
        // 【修复】从 configRules 正确获取连续天数
        const regionConfig = configRules.regions?.shanghai || {};
        staffData.forEach(staff => {
            const staffId = staff.id || staff.staffId;
            if (!schedule[staffId]) {
                return;
            }
            
            const maxConsecutive = staff.gender === '男' || staff.gender === 'M' 
                ? (regionConfig.maleConsecutiveDays || 4)
                : (regionConfig.femaleConsecutiveDays || 3);
            
            const assignedDates = Object.keys(schedule[staffId])
                .filter(date => schedule[staffId][date] === 'NIGHT')
                .sort();
            
            if (assignedDates.length === 0) {
                return;
            }
            
            let consecutiveCount = 1;
            let maxConsecutiveFound = 1;
            
            for (let i = 1; i < assignedDates.length; i++) {
                const prevDate = new Date(assignedDates[i-1]);
                const currDate = new Date(assignedDates[i]);
                const daysDiff = (currDate - prevDate) / (1000 * 60 * 60 * 24);
                
                if (daysDiff === 1) {
                    consecutiveCount++;
                    maxConsecutiveFound = Math.max(maxConsecutiveFound, consecutiveCount);
                } else {
                    consecutiveCount = 1;
                }
            }
            
            if (maxConsecutiveFound > maxConsecutive) {
                warnings.push(`${staff.name || staffId}有连续${maxConsecutiveFound}天大夜，超过最大连续天数${maxConsecutive}天`);
                console.warn(`[验证警告] ${staff.name || staffId}有连续${maxConsecutiveFound}天大夜，超过最大连续天数${maxConsecutive}天`);
            }
        });
        
        const isValid = errors.length === 0;
        console.log(`[NightShiftSolver] 验证完成：${errors.length}个错误，${warnings.length}个警告，${isValid ? '通过' : '失败'}`);
        
        return { errors, warnings, isValid };
    },

    /**
     * 获取排班模式配置
     * @returns {string} 'continuous' | 'distributed'
     */
    getArrangementMode() {
        // 【重构】统一使用 NightShiftConfigRules
        const constraints = NightShiftConfigRules.getConstraintsConfig();
        return constraints.arrangementMode || 'continuous';
    },

    /**
     * 获取最小间隔天数配置
     * @returns {number} 最小间隔天数
     */
    getMinIntervalDays() {
        // 【重构】统一使用 NightShiftConfigRules
        const constraints = NightShiftConfigRules.getConstraintsConfig();
        return constraints.minIntervalDays || 7;
    },

    /**
     * 获取女生优先策略配置
     * @returns {Object} { enabled, minLastMonthDays, reducedDays, normalDays, applyCondition }
     */
    getFemalePriorityConfig() {
        // 【重构】统一使用 NightShiftConfigRules
        return NightShiftConfigRules.getFemalePriorityConfig();
    },

    /**
     * 获取上月大夜权重配置
     * @returns {Object} { enabled, dataSource, segments }
     */
    getLastMonthWeightConfig() {
        // 【重构】统一使用 NightShiftConfigRules
        return NightShiftConfigRules.getLastMonthWeightConfig();
    },

    /**
     * 获取地区配置（含硬上限和连续天数）
     * @param {string} regionKey - 地区代码
     * @returns {Object} { name, aliases, dailyMin, dailyMax, maleConsecutiveDays, femaleConsecutiveDays, maleMaxDaysPerMonth, femaleMaxDaysPerMonth }
     */
    getRegionConfig(regionKey) {
        if (typeof NightShiftConfigRules !== 'undefined') {
            return NightShiftConfigRules.getRegionConfig(regionKey) || {};
        }
        // 默认返回上海配置
        return {
            name: '上海',
            aliases: ['上海', '沪', 'SH'],
            dailyMin: 1,
            dailyMax: 2,
            maleConsecutiveDays: 4,
            femaleConsecutiveDays: 3,
            maleMaxDaysPerMonth: 4,
            femaleMaxDaysPerMonth: 3
        };
    },

    /**
     * 获取生理期配置
     * @returns {Object} { enabled, firstHalf, secondHalf }
     */
    getMenstrualPeriodConfig() {
        // 【重构】统一使用 NightShiftConfigRules
        return NightShiftConfigRules.getMenstrualPeriodConfig();
    },

    /**
     * 获取哺乳期/孕妇限制配置
     * @returns {boolean} 是否启用
     */
    getLactationPregnancyRestriction() {
        // 【重构】统一使用 NightShiftConfigRules
        const constraints = NightShiftConfigRules.getConstraintsConfig();
        return constraints.checkBasicEligibility !== false;
    },

    /**
     * 获取人力富足配置
     * @returns {Object} { maleDaysPerMonth, femaleDaysPerMonth, richThreshold, shortageThreshold, shortageIncreaseDays }
     */
    getManpowerCalculationConfig() {
        // 【重构】统一使用 NightShiftConfigRules
        return NightShiftConfigRules.getManpowerCalculationConfig();
    },

    /**
     * 获取人力调整策略配置
     * @returns {Object} { allowMaleReduceTo3Days, allowMaleIncreaseTo5Days }
     */
    getManpowerAdjustmentConfig() {
        // 【重构】统一使用 NightShiftConfigRules
        const constraints = NightShiftConfigRules.getConstraintsConfig();
        return {
            allowMaleReduceTo3Days: constraints.allowMaleReduceTo3Days !== false,
            allowMaleIncreaseTo5Days: constraints.allowMaleIncreaseTo5Days !== false
        };
    },

    /**
     * 获取严格连续排班配置
     * @returns {Object} { enabled, rateSch, isNul, postShiftRestDays, maxConsecutiveRestLimit, randomSeed }
     */
    getStrictContinuousConfig() {
        // 【重构】统一使用 NightShiftConfigRules
        return NightShiftConfigRules.getStrictContinuousConfig();
    },

    // ==================== 格式转换方法 ====================

    /**
     * 将按人员组织的排班格式转换为按日期组织的格式
     * NightShiftSolver 输出格式: { staffId: { dateStr: 'NIGHT' } }
     * 标准格式: { dateStr: [{ staffId, name, gender, ... }] }
     *
     * @param {Object} schedule - 按人员组织的排班表
     * @param {Array} staffData - 人员数据列表
     * @param {string} location - 地点
     * @returns {Object} 按日期组织的排班表
     */
    convertToDateBasedFormat(schedule, staffData, location = '上海') {
        const dateBasedSchedule = {};

        // 构建人员信息映射
        const staffMap = {};
        staffData.forEach(staff => {
            const staffId = staff.id || staff.staffId;
            staffMap[staffId] = {
                staffId: staffId,
                name: staff.name,
                gender: staff.gender,
                location: staff.location || location
            };
        });

        // 转换格式
        for (const [staffId, dates] of Object.entries(schedule)) {
            for (const [dateStr, shiftType] of Object.entries(dates)) {
                if (shiftType === 'NIGHT') {
                    if (!dateBasedSchedule[dateStr]) {
                        dateBasedSchedule[dateStr] = [];
                    }
                    const staffInfo = staffMap[staffId] || { staffId, name: staffId, location };
                    dateBasedSchedule[dateStr].push({
                        ...staffInfo,
                        date: dateStr,
                        shiftType: 'NIGHT'
                    });
                }
            }
        }

        return dateBasedSchedule;
    },

    /**
     * 将按日期组织的排班格式转换为按人员组织的格式
     * 标准格式: { dateStr: [{ staffId, ... }] }
     * NightShiftSolver 输出格式: { staffId: { dateStr: 'NIGHT' } }
     *
     * @param {Object} dateBasedSchedule - 按日期组织的排班表
     * @returns {Object} 按人员组织的排班表
     */
    convertToStaffBasedFormat(dateBasedSchedule) {
        const staffBasedSchedule = {};

        for (const [dateStr, assignments] of Object.entries(dateBasedSchedule)) {
            assignments.forEach(assignment => {
                const staffId = assignment.staffId;
                if (!staffBasedSchedule[staffId]) {
                    staffBasedSchedule[staffId] = {};
                }
                staffBasedSchedule[staffId][dateStr] = assignment.shiftType || 'NIGHT';
            });
        }

        return staffBasedSchedule;
    },

    /**
     * 验证排班格式
     * @param {Object} schedule - 排班表
     * @param {string} expectedFormat - 期望格式: 'date' | 'staff'
     * @returns {Object} { valid: boolean, format: string, errors: string[] }
     */
    validateScheduleFormat(schedule, expectedFormat = 'staff') {
        const errors = [];

        // 检查是否是对象
        if (typeof schedule !== 'object' || schedule === null) {
            return { valid: false, format: 'unknown', errors: ['排班表必须是对象'] };
        }

        // 检查是否为空对象
        if (Object.keys(schedule).length === 0) {
            return { valid: true, format: 'empty', errors: [] };
        }

        // 检测格式
        let detectedFormat = 'unknown';
        const firstKey = Object.keys(schedule)[0];
        const firstValue = schedule[firstKey];

        if (typeof firstValue === 'object' && firstValue !== null) {
            // 检查值的类型：如果值是字符串（如 'NIGHT'），则是 staff 格式
            // 如果值是数组或对象（包含人员信息），则是 date 格式
            const innerKeys = Object.keys(firstValue);
            const innerValue = firstValue[innerKeys[0]];
            if (typeof innerValue === 'string') {
                detectedFormat = 'staff';
            } else if (Array.isArray(firstValue) || (innerKeys.includes('staffId') && typeof firstValue[innerKeys[0]] !== 'string')) {
                detectedFormat = 'date';
            }
        }

        const isValid = detectedFormat === expectedFormat || detectedFormat === 'empty';

        if (!isValid) {
            errors.push(`期望格式: ${expectedFormat}, 检测到格式: ${detectedFormat}`);
        }

        return {
            valid: isValid,
            format: detectedFormat,
            errors
        };
    },

    // ==================== 回溯机制 ====================

    /**
     * 带回溯的分配算法
     * 当贪心分配失败时，尝试回溯调整之前的分配
     *
     * @param {Object} params - 分配参数
     * @returns {Object} 分配结果
     */
    assignWithBacktracking(params) {
        const {
            schedule,
            mandatoryRestDays,
            staff,
            dateList,
            targetDays,
            personalRequests,
            restDays,
            rules,
            usedDates,
            minIntervalDays,
            maxPeoplePerDay,
            location
        } = params;

        const staffId = staff.staffId || staff.id;
        const result = {
            success: false,
            assignedDates: [],
            attempts: 0,
            backtrackCount: 0
        };

        // 记录初始状态（用于回滚）
        const initialScheduleState = JSON.parse(JSON.stringify(schedule[staffId] || {}));
        const initialUsedDates = new Set(usedDates);

        // 尝试直接分配
        result.attempts++;
        const continuousResult = this.findAvailableContinuousPeriod(
            dateList, targetDays, personalRequests[staffId] || {}, restDays,
            new Set(), usedDates, schedule[staffId], mandatoryRestDays[staffId],
            targetDays, schedule, maxPeoplePerDay, location
        );

        if (continuousResult) {
            // 分配成功
            continuousResult.forEach(dateStr => {
                schedule[staffId][dateStr] = 'NIGHT';
                usedDates.add(dateStr);
                this.addMandatoryRestDaysAfterNightShift(
                    mandatoryRestDays[staffId], dateStr, dateList
                );
            });
            result.success = true;
            result.assignedDates = continuousResult;
            return result;
        }

        // 尝试分散分配
        result.attempts++;
        const distributedResult = this.assignDistributedForStaff(
            schedule, mandatoryRestDays, staff, dateList, targetDays,
            personalRequests, restDays, rules, usedDates, minIntervalDays, maxPeoplePerDay, location
        );

        if (distributedResult.length > 0) {
            result.success = true;
            result.assignedDates = distributedResult;
            return result;
        }

        // 回溯尝试：放宽约束重新分配
        console.log(`[NightShiftSolver] ${staff.name} 初次分配失败，尝试回溯...`);
        result.backtrackCount++;

        // 回滚到初始状态
        Object.keys(initialScheduleState).forEach(key => {
            if (!schedule[staffId]) schedule[staffId] = {};
            schedule[staffId][key] = initialScheduleState[key];
        });
        usedDates.clear();
        initialUsedDates.forEach(d => usedDates.add(d));

        // 尝试缩短连续天数分配
        for (let reducedDays = targetDays - 1; reducedDays >= Math.max(1, targetDays - 2); reducedDays--) {
            result.attempts++;
            const reducedResult = this.findAvailableContinuousPeriod(
                dateList, reducedDays, personalRequests[staffId] || {}, restDays,
                new Set(), usedDates, schedule[staffId], mandatoryRestDays[staffId],
                reducedDays, schedule, maxPeoplePerDay, location
            );

            if (reducedResult) {
                reducedResult.forEach(dateStr => {
                    schedule[staffId][dateStr] = 'NIGHT';
                    usedDates.add(dateStr);
                    this.addMandatoryRestDaysAfterNightShift(
                        mandatoryRestDays[staffId], dateStr, dateList
                    );
                });
                result.success = true;
                result.assignedDates = reducedResult;
                console.log(`[NightShiftSolver] ${staff.name} 回溯成功（${reducedDays}天模式）`);
                return result;
            }
        }

        console.log(`[NightShiftSolver] ${staff.name} 回溯失败`);
        return result;
    }
};

// 暴露到全局作用域
if (typeof window !== 'undefined') {
    window.NightShiftSolver = NightShiftSolver;
    console.log('[NightShiftSolver] 已暴露到 window.NightShiftSolver');
    console.log('[NightShiftSolver] algorithmMode =', NightShiftSolver.algorithmMode);
    console.log('[NightShiftSolver] ========== 脚本加载完成 ==========');
} else {
    console.log('[NightShiftSolver] window 不存在，未能暴露到全局');
}

// 文件加载完成标记
console.log('[NightShiftSolver] ========== 文件末尾到达 ==========');
