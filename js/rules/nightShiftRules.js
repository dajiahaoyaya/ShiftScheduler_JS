/**
 * 夜班排班规则配置模块
 * 负责夜班排班规则的配置和管理
 */

const NightShiftRules = {
    /**
     * 默认规则配置
     */
    defaultRules: {
        // 连续性大夜安排
        continuousNightShift: {
            enabled: true, // 是否启用连续性大夜
            maleDays: 4, // 男性连续大夜天数
            femaleDays: 3, // 女性连续大夜天数
            // 新增：大夜连续/分散安排配置
            arrangementMode: 'continuous', // 'continuous' 连续安排 或 'distributed' 分散安排
            minIntervalDays: 7 // 分散安排时，每两次大夜之间的最小间隔天数
        },
        // 生理期时间段禁止排夜班
        menstrualPeriodRestriction: {
            enabled: true, // 是否启用生理期限制
            // 生理期时间段：'upper' 上半月 或 'lower' 下半月
        },
        // 哺乳期、孕妇不排大夜
        lactationPregnancyRestriction: {
            enabled: true, // 是否启用哺乳期/孕妇限制
        },
        // 人力满足情况下，部分人员适当减少1天大夜
        reduceNightShiftDays: {
            enabled: true, // 是否启用减少大夜天数
            reductionRatio: 0.2 // 减少大夜天数的人员比例（20%）
        },
        // 上月大夜4天的人员，本月优先减少
        lastMonthCompensation: {
            enabled: true, // 是否启用上月补偿
            priorityThreshold: 4 // 上月大夜天数阈值
        },
        // 全年大夜天数平均分配（按性别分组）
        averageDistribution: {
            enabled: true, // 是否启用平均分配
            groupByGender: true // 是否按性别分组
        }
    },

    /**
     * 当前规则配置（从数据库加载或使用默认值）
     */
    currentRules: null,

    /**
     * 初始化规则配置
     */
    async init() {
        try {
            // 尝试从数据库加载规则配置
            if (typeof DB !== 'undefined') {
                // 确保数据库已初始化
                if (!DB.db) {
                    await DB.init();
                }
                
                // 检查方法是否存在
                if (typeof DB.loadNightShiftRules === 'function') {
                    const savedRules = await DB.loadNightShiftRules();
                    if (savedRules) {
                        this.currentRules = { ...this.defaultRules, ...savedRules };
                    } else {
                        this.currentRules = JSON.parse(JSON.stringify(this.defaultRules));
                    }
                } else {
                    console.warn('DB.loadNightShiftRules 方法不存在，使用默认规则');
                    this.currentRules = JSON.parse(JSON.stringify(this.defaultRules));
                }
            } else {
                this.currentRules = JSON.parse(JSON.stringify(this.defaultRules));
            }
        } catch (error) {
            console.error('加载夜班规则配置失败:', error);
            // 如果是因为对象存储不存在，尝试重新初始化数据库
            if (error.message && error.message.includes('不存在')) {
                console.log('尝试重新初始化数据库以创建缺失的对象存储...');
                try {
                    if (typeof DB !== 'undefined') {
                        // 增加版本号以触发升级
                        DB.dbVersion = 3;
                        await DB.init();
                        // 再次尝试加载
                        if (typeof DB.loadNightShiftRules === 'function') {
                            const savedRules = await DB.loadNightShiftRules();
                            if (savedRules) {
                                this.currentRules = { ...this.defaultRules, ...savedRules };
                            } else {
                                this.currentRules = JSON.parse(JSON.stringify(this.defaultRules));
                            }
                        } else {
                            this.currentRules = JSON.parse(JSON.stringify(this.defaultRules));
                        }
                    } else {
                        this.currentRules = JSON.parse(JSON.stringify(this.defaultRules));
                    }
                } catch (retryError) {
                    console.error('重新初始化数据库失败:', retryError);
                    this.currentRules = JSON.parse(JSON.stringify(this.defaultRules));
                }
            } else {
                this.currentRules = JSON.parse(JSON.stringify(this.defaultRules));
            }
        }
    },

    /**
     * 获取当前规则配置
     */
    getRules() {
        if (!this.currentRules) {
            this.currentRules = JSON.parse(JSON.stringify(this.defaultRules));
        }
        return this.currentRules;
    },

    /**
     * 更新规则配置
     * @param {Object} updates - 要更新的规则配置
     */
    async updateRules(updates) {
        if (!this.currentRules) {
            await this.init();
        }
        
        // 深度合并更新
        this.currentRules = this.deepMerge(this.currentRules, updates);
        
        // 保存到数据库
        try {
            if (typeof DB !== 'undefined' && DB.db) {
                await DB.saveNightShiftRules(this.currentRules);
            }
        } catch (error) {
            console.error('保存夜班规则配置失败:', error);
        }
    },

    /**
     * 深度合并对象
     */
    deepMerge(target, source) {
        const output = { ...target };
        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target)) {
                        Object.assign(output, { [key]: source[key] });
                    } else {
                        output[key] = this.deepMerge(target[key], source[key]);
                    }
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        return output;
    },

    /**
     * 判断是否为对象
     */
    isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    },

    /**
     * 重置为默认规则
     */
    async resetToDefault() {
        this.currentRules = JSON.parse(JSON.stringify(this.defaultRules));
        try {
            if (typeof DB !== 'undefined' && DB.db) {
                await DB.saveNightShiftRules(this.currentRules);
            }
        } catch (error) {
            console.error('重置夜班规则配置失败:', error);
        }
    }
};

// 暴露到全局作用域
if (typeof window !== 'undefined') {
    window.NightShiftRules = NightShiftRules;
}

