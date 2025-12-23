/**
 * 白班排班规则配置模块
 * 负责白班排班规则的配置和管理
 */

const DayShiftRules = {
    /**
     * 默认规则配置
     */
    defaultRules: {
        // 技能匹配约束
        skillMatching: {
            enabled: true, // 是否启用技能匹配
            requiredSkills: ['网', '天', '微'], // 必需技能列表
            minSkillCoverage: 1 // 每个班次至少需要的技能覆盖数
        },
        // 需求数量匹配
        demandMatching: {
            enabled: true, // 是否启用需求匹配
            matchByLocation: false, // 是否按地域匹配
            matchByPersonType: false // 是否按人员类型匹配
        },
        // CSP约束求解
        cspSolver: {
            enabled: true, // 是否启用CSP求解
            maxIterations: 1000, // 最大迭代次数
            backtrackLimit: 100 // 回溯限制
        },
        // 考虑夜班结果，避免冲突
        avoidNightShiftConflict: {
            enabled: true // 是否避免与夜班冲突
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
                if (typeof DB.loadDayShiftRules === 'function') {
                    const savedRules = await DB.loadDayShiftRules();
                    if (savedRules) {
                        this.currentRules = { ...this.defaultRules, ...savedRules };
                    } else {
                        this.currentRules = JSON.parse(JSON.stringify(this.defaultRules));
                    }
                } else {
                    console.warn('DB.loadDayShiftRules 方法不存在，使用默认规则');
                    this.currentRules = JSON.parse(JSON.stringify(this.defaultRules));
                }
            } else {
                this.currentRules = JSON.parse(JSON.stringify(this.defaultRules));
            }
        } catch (error) {
            console.error('加载白班规则配置失败:', error);
            // 如果是因为对象存储不存在，尝试重新初始化数据库
            if (error.message && error.message.includes('不存在')) {
                console.log('尝试重新初始化数据库以创建缺失的对象存储...');
                try {
                    if (typeof DB !== 'undefined') {
                        // 增加版本号以触发升级
                        DB.dbVersion = 3;
                        await DB.init();
                        // 再次尝试加载
                        if (typeof DB.loadDayShiftRules === 'function') {
                            const savedRules = await DB.loadDayShiftRules();
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
                await DB.saveDayShiftRules(this.currentRules);
            }
        } catch (error) {
            console.error('保存白班规则配置失败:', error);
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
                await DB.saveDayShiftRules(this.currentRules);
            }
        } catch (error) {
            console.error('重置白班规则配置失败:', error);
        }
    }
};

// 暴露到全局作用域
if (typeof window !== 'undefined') {
    window.DayShiftRules = DayShiftRules;
}

