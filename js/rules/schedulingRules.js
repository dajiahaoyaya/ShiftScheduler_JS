/**
 * 排班顺序和优先级规则配置模块
 * 负责排班顺序、优先级等个性化规则的配置和管理
 */

const SchedulingRules = {
    /**
     * 默认规则配置
     */
    defaultRules: {
        // 排班顺序（按优先级从高到低）
        schedulingOrder: [
            'personalRequests', // 1. 满足个性化休假需求（优先保证）
            'basicRestRules', // 2. 满足基础休息需求规则
            'nightShiftRules', // 3. 夜班需求规则
            'dayShiftRules' // 4. 白班的排办约束
        ],
        // 基础休息需求规则
        basicRestRules: {
            enabled: true,
            // 指定休息日一般不可超过3天，且周末不可超过2天
            maxRestDays: 3,
            maxWeekendRestDays: 2,
            // 全月休息日天数满足当前周期的法定休息日天数>=
            ensureLegalRestDays: true,
            // 节假休息天数平均分配
            averageHolidayRestDays: true,
            // 春节、国庆积分分配
            usePriorityScore: true
        },
        // 规则优先级权重（用于冲突解决）
        ruleWeights: {
            personalRequests: 100, // 个性化休假需求权重最高
            basicRestRules: 80,
            nightShiftRules: 60,
            dayShiftRules: 40
        },
        // 冲突解决策略
        conflictResolution: {
            strategy: 'priority', // 'priority' 按优先级 或 'balance' 平衡分配
            allowOverride: false // 是否允许高优先级规则覆盖低优先级规则
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
                if (typeof DB.loadSchedulingRules === 'function') {
                    const savedRules = await DB.loadSchedulingRules();
                    if (savedRules) {
                        this.currentRules = { ...this.defaultRules, ...savedRules };
                    } else {
                        this.currentRules = JSON.parse(JSON.stringify(this.defaultRules));
                    }
                } else {
                    console.warn('DB.loadSchedulingRules 方法不存在，使用默认规则');
                    this.currentRules = JSON.parse(JSON.stringify(this.defaultRules));
                }
            } else {
                this.currentRules = JSON.parse(JSON.stringify(this.defaultRules));
            }
        } catch (error) {
            console.error('加载排班规则配置失败:', error);
            // 如果是因为对象存储不存在，尝试重新初始化数据库
            if (error.message && error.message.includes('不存在')) {
                console.log('尝试重新初始化数据库以创建缺失的对象存储...');
                try {
                    if (typeof DB !== 'undefined') {
                        // 增加版本号以触发升级
                        DB.dbVersion = 3;
                        await DB.init();
                        // 再次尝试加载
                        if (typeof DB.loadSchedulingRules === 'function') {
                            const savedRules = await DB.loadSchedulingRules();
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
                await DB.saveSchedulingRules(this.currentRules);
            }
        } catch (error) {
            console.error('保存排班规则配置失败:', error);
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
                } else if (Array.isArray(source[key])) {
                    output[key] = [...source[key]];
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
                await DB.saveSchedulingRules(this.currentRules);
            }
        } catch (error) {
            console.error('重置排班规则配置失败:', error);
        }
    },

    /**
     * 获取排班顺序
     */
    getSchedulingOrder() {
        const rules = this.getRules();
        return rules.schedulingOrder || this.defaultRules.schedulingOrder;
    },

    /**
     * 获取规则权重
     */
    getRuleWeight(ruleName) {
        const rules = this.getRules();
        return rules.ruleWeights?.[ruleName] || 0;
    }
};

// 暴露到全局作用域
if (typeof window !== 'undefined') {
    window.SchedulingRules = SchedulingRules;
}

