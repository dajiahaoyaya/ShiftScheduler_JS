/**
 * 夜班排班规则配置模块（已废弃）
 *
 * ⚠️ 警告：此模块已废弃，所有配置已迁移至 NightShiftConfigRules.js
 *
 * 迁移说明：
 * - continuousNightShift → 已迁移到 NightShiftConfigRules.regions.{region}.consecutiveDays
 * - menstrualPeriodRestriction → 已迁移到 NightShiftConfigRules.constraints.checkMenstrualPeriod
 * - lactationPregnancyRestriction → 已迁移到 NightShiftConfigRules.constraints.checkBasicEligibility
 * - reduceNightShiftDays → 已迁移到 NightShiftConfigRules.constraints.allowMaleReduceTo3Days
 * - lastMonthCompensation → 已迁移到 NightShiftConfigRules.priority.femalePriority
 * - averageDistribution → 已迁移到 NightShiftConfigRules.priority.genderBalance
 * - manpowerSufficiency → 已迁移到 NightShiftConfigRules.manpowerCalculation
 * - femalePriority → 已迁移到 NightShiftConfigRules.priority.femalePriority
 * - lastMonthWeight → 已迁移到 NightShiftConfigRules.priority.lastMonthWeight
 * - vacationConflict → 已迁移到 NightShiftConfigRules.constraints.vacationStrictMode/vacationSkipLegal/vacationSkipReq
 *
 * 请使用 NightShiftConfigRules 进行所有大夜排班配置
 */

const NightShiftRules = {
    /**
     * @deprecated 已废弃，请使用 NightShiftConfigRules.getRules()
     * 获取当前规则配置（兼容旧代码）
     */
    getRules() {
        console.warn('[NightShiftRules] 此模块已废弃，请使用 NightShiftConfigRules');
        
        // 返回兼容的配置结构（映射到新的ConfigRules）
        const config = typeof NightShiftConfigRules !== 'undefined' 
            ? NightShiftConfigRules.getConfig() 
            : null;
        
        if (!config) {
            // 如果NightShiftConfigRules未加载，返回空对象
            return {};
        }

        // 将新的配置结构映射为旧的规则结构（保持兼容性）
        const regionConfig = config.regions.shanghai || {};
        const constraints = config.constraints || {};
        const priority = config.priority || {};
        const manpower = config.manpowerCalculation || {};
        const menstrual = config.menstrualPeriod || {};

        return {
            // 连续性大夜安排
            continuousNightShift: {
                enabled: true,
                maleDays: regionConfig.maleConsecutiveDays || 4,
                femaleDays: regionConfig.femaleConsecutiveDays || 3,
                arrangementMode: constraints.arrangementMode || 'continuous',
                minIntervalDays: constraints.minIntervalDays || 7
            },
            // 生理期时间段禁止排夜班
            menstrualPeriodRestriction: {
                enabled: constraints.checkMenstrualPeriod !== false
            },
            // 哺乳期、孕妇不排大夜
            lactationPregnancyRestriction: {
                enabled: constraints.checkBasicEligibility !== false
            },
            // 人力满足情况下，部分人员适当减少1天大夜
            reduceNightShiftDays: {
                enabled: constraints.allowMaleReduceTo3Days !== false,
                reductionRatio: 0.2
            },
            // 上月大夜4天的人员，本月优先减少
            lastMonthCompensation: {
                enabled: priority.femalePriority?.enabled !== false,
                priorityThreshold: priority.femalePriority?.minLastMonthDays || 4
            },
            // 全年大夜天数平均分配（按性别分组）
            averageDistribution: {
                enabled: priority.genderBalance?.enabled !== false,
                groupByGender: true
            },
            // 人力富足判断配置
            manpowerSufficiency: {
                enabled: true,
                mode: 'simple',
                threshold: manpower.richThreshold || 0
            },
            // 女生优先3天策略
            femalePriority: {
                enabled: priority.femalePriority?.enabled !== false,
                minLastMonthDays: priority.femalePriority?.minLastMonthDays || 4,
                reducedDays: priority.femalePriority?.reducedDays || 3,
                normalDays: priority.femalePriority?.normalDays || 4,
                applyCondition: priority.femalePriority?.applyCondition || 'sufficient'
            },
            // 上月大夜权重配置
            lastMonthWeight: {
                enabled: priority.lastMonthWeight?.enabled !== false,
                segments: priority.lastMonthWeight?.segments || [],
                dataSource: priority.lastMonthWeight?.dataSource || 'auto'
            },
            // 休假冲突处理
            vacationConflict: {
                enabled: constraints.checkVacationConflict !== false,
                strictMode: constraints.vacationStrictMode !== false,
                legalVacationSkip: constraints.vacationSkipLegal !== false,
                reqVacationSkip: constraints.vacationSkipReq !== false
            }
        };
    },

    /**
     * @deprecated 已废弃，请使用 NightShiftConfigRules.updateConfig()
     * 更新规则配置（兼容旧代码）
     */
    async updateRules(updates) {
        console.warn('[NightShiftRules] 此模块已废弃，请使用 NightShiftConfigRules.updateConfig()');
        
        // 将旧的更新映射到新的配置结构
        if (typeof NightShiftConfigRules === 'undefined') {
            console.error('NightShiftConfigRules 未加载');
            return;
        }

        const mappedUpdates = {};

        // 映射 continuousNightShift
        if (updates.continuousNightShift) {
            if (!mappedUpdates.regions) mappedUpdates.regions = {};
            if (!mappedUpdates.regions.shanghai) mappedUpdates.regions.shanghai = {};
            
            if (updates.continuousNightShift.maleDays !== undefined) {
                mappedUpdates.regions.shanghai.maleConsecutiveDays = updates.continuousNightShift.maleDays;
            }
            if (updates.continuousNightShift.femaleDays !== undefined) {
                mappedUpdates.regions.shanghai.femaleConsecutiveDays = updates.continuousNightShift.femaleDays;
            }
        }

        // 映射 menstrualPeriodRestriction
        if (updates.menstrualPeriodRestriction) {
            if (!mappedUpdates.constraints) mappedUpdates.constraints = {};
            mappedUpdates.constraints.checkMenstrualPeriod = updates.menstrualPeriodRestriction.enabled;
        }

        // 映射 lactationPregnancyRestriction
        if (updates.lactationPregnancyRestriction) {
            if (!mappedUpdates.constraints) mappedUpdates.constraints = {};
            mappedUpdates.constraints.checkBasicEligibility = updates.lactationPregnancyRestriction.enabled;
        }

        // 映射 reduceNightShiftDays
        if (updates.reduceNightShiftDays) {
            if (!mappedUpdates.constraints) mappedUpdates.constraints = {};
            mappedUpdates.constraints.allowMaleReduceTo3Days = updates.reduceNightShiftDays.enabled;
        }

        // 映射 lastMonthCompensation
        if (updates.lastMonthCompensation) {
            if (!mappedUpdates.priority) mappedUpdates.priority = {};
            if (!mappedUpdates.priority.femalePriority) mappedUpdates.priority.femalePriority = {};
            mappedUpdates.priority.femalePriority.enabled = updates.lastMonthCompensation.enabled;
            if (updates.lastMonthCompensation.priorityThreshold !== undefined) {
                mappedUpdates.priority.femalePriority.minLastMonthDays = updates.lastMonthCompensation.priorityThreshold;
            }
        }

        // 映射 averageDistribution
        if (updates.averageDistribution) {
            if (!mappedUpdates.priority) mappedUpdates.priority = {};
            if (!mappedUpdates.priority.genderBalance) mappedUpdates.priority.genderBalance = {};
            mappedUpdates.priority.genderBalance.enabled = updates.averageDistribution.enabled;
        }

        // 映射 manpowerSufficiency
        if (updates.manpowerSufficiency) {
            if (!mappedUpdates.manpowerCalculation) mappedUpdates.manpowerCalculation = {};
            if (updates.manpowerSufficiency.threshold !== undefined) {
                mappedUpdates.manpowerCalculation.richThreshold = updates.manpowerSufficiency.threshold;
            }
        }

        // 映射 femalePriority
        if (updates.femalePriority) {
            if (!mappedUpdates.priority) mappedUpdates.priority = {};
            if (!mappedUpdates.priority.femalePriority) mappedUpdates.priority.femalePriority = {};
            Object.assign(mappedUpdates.priority.femalePriority, updates.femalePriority);
        }

        // 映射 lastMonthWeight
        if (updates.lastMonthWeight) {
            if (!mappedUpdates.priority) mappedUpdates.priority = {};
            mappedUpdates.priority.lastMonthWeight = updates.lastMonthWeight;
        }

        // 映射 vacationConflict
        if (updates.vacationConflict) {
            if (!mappedUpdates.constraints) mappedUpdates.constraints = {};
            mappedUpdates.constraints.checkVacationConflict = updates.vacationConflict.enabled;
            mappedUpdates.constraints.vacationStrictMode = updates.vacationConflict.strictMode;
            mappedUpdates.constraints.vacationSkipLegal = updates.vacationConflict.legalVacationSkip;
            mappedUpdates.constraints.vacationSkipReq = updates.vacationConflict.reqVacationSkip;
        }

        // 调用新的更新方法
        await NightShiftConfigRules.updateConfig(mappedUpdates);
    },

    /**
     * @deprecated 已废弃，请使用 NightShiftConfigRules.resetToDefault()
     * 重置为默认规则（兼容旧代码）
     */
    async resetToDefault() {
        console.warn('[NightShiftRules] 此模块已废弃，请使用 NightShiftConfigRules.resetToDefault()');
        
        if (typeof NightShiftConfigRules !== 'undefined') {
            await NightShiftConfigRules.resetToDefault();
        }
    },

    /**
     * @deprecated 已废弃，请使用 NightShiftConfigRules.init()
     * 初始化规则配置（兼容旧代码）
     */
    async init() {
        console.warn('[NightShiftRules] 此模块已废弃，请使用 NightShiftConfigRules.init()');
        
        // 不做任何操作，由NightShiftConfigRules处理初始化
        return;
    }
};

// 暴露到全局作用域（保持兼容性）
if (typeof window !== 'undefined') {
    window.NightShiftRules = NightShiftRules;
}
