/**
 * 大夜配置规则模块（统一版）
 *
 * 这是大夜排班的核心配置模块，整合了所有配置参数：
 * - 地区配置（上海）
 * - 人力计算配置
 * - 约束规则配置
 * - 排班优先级配置
 * - 严格连续排班配置
 *
 * ============================================================
 * 约束类型说明：
 * - 【硬约束】（不可违反）：硬上限、每日人数、休假冲突、生理期限制
 * - 【软约束】（尽量满足）：目标天数、连续天数、公平性策略
 * ============================================================
 *
 * 注意：NightShiftRules.js 已废弃，所有规则统一在此配置
 */

const NightShiftConfigRules = {
    /**
     * 默认配置
     */
    defaultConfig: {
        // 地区配置
        regions: {
            shanghai: {
                name: '上海',
                aliases: ['上海', '沪', 'SH'],
                dailyMin: 1,        // 【硬约束】每日最少大夜人数（强制执行）
                dailyMax: 2,        // 【硬约束】每日最大大夜人数（强制执行）
                maleConsecutiveDays: 3,  // 【软约束】男生连续天数（标准）- 已修改为新算法要求
                femaleConsecutiveDays: 2, // 【软约束】女生连续天数（标准）- 已修改为新算法要求
                maleMaxDaysPerMonth: 4,   // 【硬约束】男生每月最大天数（硬上限）
                femaleMaxDaysPerMonth: 3  // 【硬约束】女生每月最大天数（硬上限）
            }
        },

        // 跨地区配置（预留，当前仅上海）
        crossRegion: {
            totalDailyMin: 1,    // 【硬约束】每天最少总人数（预留）
            totalDailyMax: 2,    // 【硬约束】每天最大总人数（预留）
            enableBackup: false  // 是否启用跨地区补充（预留）
        },

        // 人力计算配置
        manpowerCalculation: {
            maleDaysPerMonth: 4,     // 男生每月标准大夜天数
            femaleDaysPerMonth: 3,   // 女生每月标准大夜天数
            richThreshold: 0,        // 富裕阈值（人天数-需求天数），超过此值可减少男生天数
            shortageThreshold: 0,    // 不足阈值，低于此值需增加男生天数
            shortageIncreaseDays: 5  // 人力不足时，男生可增加到的天数
        },

        // 约束规则
        constraints: {
            // 【硬约束】基础条件检查
            checkBasicEligibility: true,      // 是否检查基础条件（是否标记可排夜班）

            // 【硬约束】生理期检查
            checkMenstrualPeriod: true,       // 是否检查生理期（女生）
            menstrualBufferDays: 0,           // 生理期后缓冲天数（0表示仅当天不排）

            // 【硬约束】休假冲突检查
            checkVacationConflict: true,      // 是否检查休假冲突
            vacationStrictMode: true,         // 严格模式：ANNUAL/SICK必须避开
            vacationSkipLegal: true,          // LEGAL休假是否跳过
            vacationSkipReq: true,           // REQ休假是否跳过
            vacationBufferDays: 0,             // 休假后缓冲天数（0表示仅当天不排）

            // 【软约束】连续排班约束
            enforceDailyMin: true,            // 是否强制执行每日最少人数
            enforceDailyMax: true,            // 是否强制执行每日最大人数

            // 【软约束】人力调整策略
            allowMaleReduceTo3Days: true,     // 人力富足时允许男生减少到3天
            allowMaleIncreaseTo5Days: true,   // 人力不足时允许男生增加到5天

            // 【软约束】排班策略
            arrangementMode: 'continuous',    // 排班模式：'continuous'连续 | 'distributed'分散
            minIntervalDays: 7,                // 分散模式下，两次大夜之间的最小间隔天数
        },

        // 生理期详细配置
        menstrualPeriod: {
            enabled: true,
            firstHalf: '1-15',      // 上半月日期范围
            secondHalf: '16-31'     // 下半月日期范围
        },

        // 排班优先级配置
        priority: {
            // 【软约束】上月大夜权重
            lastMonthWeight: {
                enabled: true,
                dataSource: 'auto',         // 数据源：'auto'(自动) | 'staffField'(人员字段) | 'history'(历史记录)
                segments: [
                    { max: 3, priority: 100, targetDays: 4 },    // 上月<4天：优先级100，目标4天
                    { min: 4, priority: 50, targetDays: 3 }      // 上月>=4天：优先级50，目标3天
                ]
            },

            // 【软约束】性别均衡权重
            genderBalance: {
                enabled: true,
                weight: 0.2                  // 性别均衡在总优先级中的权重
            },

            // 【软约束】全年公平性权重
            totalFairness: {
                enabled: true,
                weight: 0.5                  // 全年公平性在总优先级中的权重
            },

            // 【软约束】女生优先策略
            femalePriority: {
                enabled: true,              // 是否启用女生优先
                applyCondition: 'sufficient', // 应用条件：'sufficient'(人力富足时) | 'always'(总是)
                minLastMonthDays: 4,        // 触发最小上月天数
                reducedDays: 3,             // 减少后的天数
                normalDays: 4               // 正常天数
            }
        },

        // 严格连续排班配置（高级功能）
        strictContinuous: {
            enabled: false,             // 是否启用严格连续排班模式
            rateSch: 1.0,               // 开工率（0.0-1.0），用于计算最大开工天数
            isNul: true,                // 是否启用精英轮空（人力富足时，部分人员完全轮空）
            postShiftRestDays: 2,       // 大夜后强制休整期天数（排班后遗症管理）
            maxConsecutiveRestLimit: 3,  // 最大连休上限（包含强制休整+原有请假/生理期），0表示从排班周期管理获取
            randomSeed: null            // 随机数种子（null表示使用时间戳，数字表示固定种子）
        }
    },

    /**
     * 当前配置
     */
    currentConfig: null,

    /**
     * 初始化配置规则
     */
    async init() {
        try {
            // 尝试从数据库加载配置
            if (typeof DB !== 'undefined' && DB.loadNightShiftConfig) {
                const savedConfig = await DB.loadNightShiftConfig();
                if (savedConfig) {
                    // 合并默认配置和已保存配置
                    this.currentConfig = this.deepMerge(this.defaultConfig, savedConfig);
                    console.log('[NightShiftConfigRules] 已加载保存的配置');
                } else {
                    // 使用默认配置
                    this.currentConfig = JSON.parse(JSON.stringify(this.defaultConfig));
                    console.log('[NightShiftConfigRules] 使用默认配置');
                }
            } else {
                // 数据库不可用，使用默认配置
                this.currentConfig = JSON.parse(JSON.stringify(this.defaultConfig));
                console.log('[NightShiftConfigRules] 数据库不可用，使用默认配置');
            }

            return this.currentConfig;
        } catch (error) {
            console.error('[NightShiftConfigRules] 初始化失败:', error);
            this.currentConfig = JSON.parse(JSON.stringify(this.defaultConfig));
            return this.currentConfig;
        }
    },

    /**
     * 获取当前配置
     */
    getConfig() {
        return this.currentConfig || this.defaultConfig;
    },

    /**
     * 设置当前配置（临时设置，不保存到数据库）
     * @param {Object} config - 配置对象
     */
    setConfig(config) {
        if (config && typeof config === 'object') {
            this.currentConfig = config;
            console.log('[NightShiftConfigRules] 已设置临时配置');
        } else {
            console.warn('[NightShiftConfigRules] setConfig: 无效的配置对象');
        }
    },

    /**
     * 获取地区配置
     * @param {string} region - 地区代码 ('shanghai')
     */
    getRegionConfig(region) {
        const config = this.getConfig();
        return config.regions[region];
    },

    /**
     * 根据地点名称获取地区配置
     * @param {string} location - 地点名称 ('上海' | 'SH' 等)
     */
    getRegionConfigByLocation(location) {
        const config = this.getConfig();

        for (const regionKey of Object.keys(config.regions)) {
            const regionConfig = config.regions[regionKey];
            if (regionConfig.aliases.includes(location)) {
                return { key: regionKey, config: regionConfig };
            }
        }

        return null;
    },

    /**
     * 获取跨地区约束配置
     */
    getCrossRegionConfig() {
        const config = this.getConfig();
        return config.crossRegion;
    },

    /**
     * 获取人力计算配置
     */
    getManpowerCalculationConfig() {
        const config = this.getConfig();
        return config.manpowerCalculation;
    },

    /**
     * 获取约束规则配置
     */
    getConstraintsConfig() {
        const config = this.getConfig();
        return config.constraints;
    },

    /**
     * 获取生理期配置
     */
    getMenstrualPeriodConfig() {
        const config = this.getConfig();
        return config.menstrualPeriod;
    },

    /**
     * 获取优先级配置
     */
    getPriorityConfig() {
        const config = this.getConfig();
        return config.priority;
    },

    /**
     * 获取严格连续排班配置
     */
    getStrictContinuousConfig() {
        const config = this.getConfig();
        return config.strictContinuous || {
            enabled: false,
            rateSch: 1.0,
            isNul: true
        };
    },

    /**
     * 获取上月大夜权重配置
     */
    getLastMonthWeightConfig() {
        const config = this.getConfig();
        return config.priority.lastMonthWeight;
    },

    /**
     * 获取女生优先策略配置
     */
    getFemalePriorityConfig() {
        const config = this.getConfig();
        return config.priority.femalePriority;
    },

    /**
     * 获取休假冲突配置
     */
    getVacationConflictConfig() {
        const config = this.getConfig();
        const constraints = config.constraints;
        return {
            enabled: constraints.checkVacationConflict,
            strictMode: constraints.vacationStrictMode,
            legalVacationSkip: constraints.vacationSkipLegal,
            reqVacationSkip: constraints.vacationSkipReq
        };
    },

    /**
     * 更新配置
     * @param {object} updates - 要更新的配置对象
     */
    async updateConfig(updates) {
        try {
            console.log('[NightShiftConfigRules] updateConfig 被调用');
            console.log('[NightShiftConfigRules] this.currentConfig:', this.currentConfig ? '已定义' : '未定义');
            console.log('[NightShiftConfigRules] updates:', updates);

            // 深度合并更新
            this.currentConfig = this.deepMerge(this.currentConfig, updates);
            console.log('[NightShiftConfigRules] 合并后的配置:', this.currentConfig ? '已生成' : '失败');

            // 保存到数据库
            if (typeof DB !== 'undefined' && DB.saveNightShiftConfig) {
                console.log('[NightShiftConfigRules] 开始保存到数据库...');
                await DB.saveNightShiftConfig(this.currentConfig);
                console.log('[NightShiftConfigRules] 数据库保存完成');
            } else {
                console.warn('[NightShiftConfigRules] DB.saveNightShiftConfig 不可用');
            }

            return this.currentConfig;
        } catch (error) {
            console.error('[NightShiftConfigRules] 更新配置失败:', error);
            console.error('[NightShiftConfigRules] 错误堆栈:', error.stack);
            throw error;
        }
    },

    /**
     * 重置为默认配置
     */
    async resetToDefault() {
        try {
            this.currentConfig = JSON.parse(JSON.stringify(this.defaultConfig));

            // 保存到数据库
            if (typeof DB !== 'undefined' && DB.saveNightShiftConfig) {
                await DB.saveNightShiftConfig(this.currentConfig);
                console.log('[NightShiftConfigRules] 已重置为默认配置');
            }

            return this.currentConfig;
        } catch (error) {
            console.error('[NightShiftConfigRules] 重置配置失败:', error);
            throw error;
        }
    },

    /**
     * 从 DailyManpowerManager 加载配置
     * 将当前排班配置中的大夜相关配置同步到大夜配置
     */
    async loadFromDailyManpowerConfig() {
        try {
            if (typeof DailyManpowerManager === 'undefined') {
                throw new Error('DailyManpowerManager 未加载');
            }

            const updates = {};

            // 加载上海配置
            const shConfig = DailyManpowerManager.matrix['大夜_上海'] ||
                           DailyManpowerManager.matrix['大夜_SH_common'];
            if (shConfig) {
                if (!updates.regions) updates.regions = {};
                if (!updates.regions.shanghai) updates.regions.shanghai = {};
                updates.regions.shanghai.dailyMin = shConfig.min || 1;
                updates.regions.shanghai.dailyMax = shConfig.max || 2;
            }

            // 应用更新
            if (Object.keys(updates).length > 0) {
                await this.updateConfig(updates);
                console.log('[NightShiftConfigRules] 已从当前排班配置加载');
                return this.currentConfig;
            } else {
                console.log('[NightShiftConfigRules] 未找到可加载的配置');
                return this.currentConfig;
            }
        } catch (error) {
            console.error('[NightShiftConfigRules] 从当前配置加载失败:', error);
            throw error;
        }
    },

    /**
     * 验证配置的有效性
     * @param {object} config - 要验证的配置
     * @returns {object} { valid: boolean, errors: string[] }
     */
    validateConfig(config) {
        const errors = [];

        try {
            // 验证地区配置
            if (!config.regions) {
                errors.push('缺少地区配置');
            } else {
                // 验证上海配置
                if (!config.regions.shanghai) {
                    errors.push('缺少上海地区配置');
                } else {
                    const sh = config.regions.shanghai;
                    if (sh.dailyMin < 0 || sh.dailyMin > 5) {
                        errors.push('上海每日最少人数应在0-5之间');
                    }
                    if (sh.dailyMax < sh.dailyMin || sh.dailyMax > 5) {
                        errors.push('上海每日最大人数应大于等于最少人数且不超过5');
                    }
                    if (sh.maleConsecutiveDays < 3 || sh.maleConsecutiveDays > 7) {
                        errors.push('上海男生连续天数应在3-7之间');
                    }
                    if (sh.femaleConsecutiveDays < 3 || sh.femaleConsecutiveDays > 7) {
                        errors.push('上海女生连续天数应在3-7之间');
                    }
                    if (sh.maleMaxDaysPerMonth < 3 || sh.maleMaxDaysPerMonth > 7) {
                        errors.push('上海男生每月最大天数应在3-7之间');
                    }
                    if (sh.femaleMaxDaysPerMonth < 3 || sh.femaleMaxDaysPerMonth > 7) {
                        errors.push('上海女生每月最大天数应在3-7之间');
                    }
                }

            }

            // 验证总约束
            if (!config.crossRegion) {
                errors.push('缺少总约束配置');
            } else {
                const cr = config.crossRegion;
                if (cr.totalDailyMin < 0 || cr.totalDailyMin > 5) {
                    errors.push('每天最少总人数应在0-5之间');
                }
                if (cr.totalDailyMax < cr.totalDailyMin || cr.totalDailyMax > 5) {
                    errors.push('每天最大总人数应大于等于最少人数且不超过5');
                }
            }

            // 验证人力计算配置
            if (!config.manpowerCalculation) {
                errors.push('缺人力计算配置');
            } else {
                const mc = config.manpowerCalculation;
                if (mc.maleDaysPerMonth < 3 || mc.maleDaysPerMonth > 7) {
                    errors.push('男生每月大夜天数应在3-7之间');
                }
                if (mc.femaleDaysPerMonth < 3 || mc.femaleDaysPerMonth > 7) {
                    errors.push('女生每月大夜天数应在3-7之间');
                }
            }

            // 验证约束规则
            if (!config.constraints) {
                errors.push('缺少约束规则配置');
            } else {
                const cs = config.constraints;
                if (cs.vacationBufferDays < 0 || cs.vacationBufferDays > 7) {
                    errors.push('休假缓冲天数应在0-7之间');
                }
                if (cs.minIntervalDays < 3 || cs.minIntervalDays > 14) {
                    errors.push('最小间隔天数应在3-14之间');
                }
            }

            // 验证严格连续排班配置（可选）
            if (config.strictContinuous) {
                const sc = config.strictContinuous;
                if (sc.rateSch !== undefined && (sc.rateSch < 0.1 || sc.rateSch > 1.0)) {
                    errors.push('开工率(rateSch)应在0.1-1.0之间');
                }
                if (sc.postShiftRestDays !== undefined) {
                    const postShiftRestDays = sc.postShiftRestDays;
                    if (typeof postShiftRestDays !== 'number' || postShiftRestDays < 0 || postShiftRestDays > 7) {
                        errors.push('大夜后强制休整期(postShiftRestDays)应在0-7之间');
                    }
                }
                if (sc.maxConsecutiveRestLimit !== undefined) {
                    const maxConsecutiveRestLimit = sc.maxConsecutiveRestLimit;
                    if (typeof maxConsecutiveRestLimit !== 'number' || maxConsecutiveRestLimit < 0 || maxConsecutiveRestLimit > 10) {
                        errors.push('最大连休上限(maxConsecutiveRestLimit)应在0-10之间（0表示从排班周期管理获取）');
                    }
                }
            }

            return {
                valid: errors.length === 0,
                errors: errors
            };
        } catch (error) {
            console.error('[NightShiftConfigRules] 验证过程出错:', error);
            console.error('[NightShiftConfigRules] 错误堆栈:', error.stack);
            return {
                valid: false,
                errors: [`验证过程出错: ${error.message}`]
            };
        }
    },

    /**
     * 深度合并对象
     * @param {object} target - 目标对象
     * @param {object} source - 源对象
     * @returns {object} 合并后的对象
     */
    deepMerge(target, source) {
        // 处理 null 或 undefined 的情况
        if (target == null) {
            return source ? JSON.parse(JSON.stringify(source)) : {};
        }
        if (source == null) {
            return JSON.parse(JSON.stringify(target));
        }

        const result = JSON.parse(JSON.stringify(target));

        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                // 跳过 undefined 值
                if (source[key] === undefined) {
                    continue;
                }
                if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                    // 递归合并对象
                    if (typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key])) {
                        result[key] = this.deepMerge(result[key], source[key]);
                    } else {
                        result[key] = JSON.parse(JSON.stringify(source[key]));
                    }
                } else {
                    // 直接赋值基本类型和数组
                    result[key] = source[key];
                }
            }
        }

        return result;
    },

    /**
     * 导出配置为JSON字符串
     */
    exportToJson() {
        return JSON.stringify(this.currentConfig, null, 2);
    },

    /**
     * 从JSON字符串导入配置
     * @param {string} jsonString - JSON字符串
     */
    importFromJson(jsonString) {
        try {
            const config = JSON.parse(jsonString);

            // 验证配置
            const validation = this.validateConfig(config);
            if (!validation.valid) {
                throw new Error('配置无效: ' + validation.errors.join(', '));
            }

            this.currentConfig = config;
            return this.currentConfig;
        } catch (error) {
            console.error('[NightShiftConfigRules] 导入配置失败:', error);
            throw error;
        }
    }
};

// 如果在浏览器环境中，挂载到全局
if (typeof window !== 'undefined') {
    window.NightShiftConfigRules = NightShiftConfigRules;
}
