/**
 * 职能均衡规则配置模块
 * 负责职能均衡规则的配置和管理
 */

const FunctionBalanceRules = {
    /**
     * 默认规则配置
     */
    defaultRules: {
        // 是否启用职能均衡
        enabled: true,

        // 需要均衡的职能列表（默认只均衡特殊职能）
        balancedFunctions: ['追', '收', '综', '银B', '毛', '星'],

        // 月度最大偏差（允许与平均值相差的最大次数）
        monthlyMaxDeviation: 1,

        // 全年最大偏差
        yearlyMaxDeviation: 3,

        // 规则优先级权重（用于冲突解决，数值越小优先级越高）
        priority: 30,

        // 优化策略
        // 'strict': 严格模式，优先满足职能均衡，可能牺牲人力配置
        // 'flexible': 弹性模式，在满足人力约束的前提下尽量均衡
        strategy: 'flexible',

        // 职能分类（用于界面展示）
        functionCategories: {
            // 在线职能（6项）
            online: [
                { id: '网', name: '网', defaultBalanced: false },
                { id: '天', name: '天', defaultBalanced: false },
                { id: '微', name: '微', defaultBalanced: false },
                { id: '毛', name: '毛', defaultBalanced: true },
                { id: '银B', name: '银B', defaultBalanced: true },
                { id: '收', name: '收', defaultBalanced: true }
            ],
            // 业务支持职能（3项）
            bizSupport: [
                { id: '星', name: '星', defaultBalanced: true },
                { id: '追', name: '追', defaultBalanced: true },
                { id: '综', name: '综', defaultBalanced: true }
            ]
        },

        // 高级选项
        advancedOptions: {
            // 是否在排班结束后进行二次优化
            enablePostOptimization: true,

            // 职能均衡与人力冲突时的处理方式
            // 'priorityManpower': 优先满足人力需求
            // 'priorityBalance': 优先满足职能均衡
            conflictResolution: 'priorityManpower',

            // 是否记录均衡度警告
            logWarnings: true,

            // 是否在界面上显示均衡度指标
            showBalanceMetrics: true
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
                if (typeof DB.loadFunctionBalanceRules === 'function') {
                    const savedRules = await DB.loadFunctionBalanceRules();
                    if (savedRules) {
                        this.currentRules = this.deepMerge(
                            JSON.parse(JSON.stringify(this.defaultRules)),
                            savedRules
                        );
                    } else {
                        this.currentRules = JSON.parse(JSON.stringify(this.defaultRules));
                    }
                } else {
                    console.warn('DB.loadFunctionBalanceRules 方法不存在，使用默认规则');
                    this.currentRules = JSON.parse(JSON.stringify(this.defaultRules));
                }
            } else {
                this.currentRules = JSON.parse(JSON.stringify(this.defaultRules));
            }

            console.log('职能均衡规则初始化完成:', this.currentRules);
        } catch (error) {
            console.error('加载职能均衡规则配置失败:', error);

            // 如果是因为对象存储不存在，尝试重新初始化数据库
            if (error.message && error.message.includes('不存在')) {
                console.log('尝试重新初始化数据库以创建缺失的对象存储...');
                try {
                    if (typeof DB !== 'undefined') {
                        // 增加版本号以触发升级
                        DB.dbVersion = 4;
                        await DB.init();

                        // 再次尝试加载
                        if (typeof DB.loadFunctionBalanceRules === 'function') {
                            const savedRules = await DB.loadFunctionBalanceRules();
                            if (savedRules) {
                                this.currentRules = this.deepMerge(
                                    JSON.parse(JSON.stringify(this.defaultRules)),
                                    savedRules
                                );
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
                if (typeof DB.saveFunctionBalanceRules === 'function') {
                    await DB.saveFunctionBalanceRules(this.currentRules);
                } else {
                    console.warn('DB.saveFunctionBalanceRules 方法不存在，规则未保存到数据库');
                }
            }
        } catch (error) {
            console.error('保存职能均衡规则配置失败:', error);
        }

        console.log('职能均衡规则已更新:', this.currentRules);
    },

    /**
     * 重置为默认规则
     */
    async resetToDefault() {
        this.currentRules = JSON.parse(JSON.stringify(this.defaultRules));

        // 保存到数据库
        try {
            if (typeof DB !== 'undefined' && DB.db) {
                if (typeof DB.saveFunctionBalanceRules === 'function') {
                    await DB.saveFunctionBalanceRules(this.currentRules);
                }
            }
        } catch (error) {
            console.error('保存职能均衡规则配置失败:', error);
        }

        console.log('职能均衡规则已重置为默认值');
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
     * 获取所有职能列表（按分类）
     */
    getAllFunctions() {
        const rules = this.getRules();
        const allFunctions = [];

        // 在线职能
        if (rules.functionCategories && rules.functionCategories.online) {
            rules.functionCategories.online.forEach(func => {
                allFunctions.push({
                    ...func,
                    category: 'online',
                    categoryName: '在线职能'
                });
            });
        }

        // 业务支持职能
        if (rules.functionCategories && rules.functionCategories.bizSupport) {
            rules.functionCategories.bizSupport.forEach(func => {
                allFunctions.push({
                    ...func,
                    category: 'bizSupport',
                    categoryName: '业务支持职能'
                });
            });
        }

        return allFunctions;
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
     * 获取职能的默认配置
     * @param {string} functionId - 职能ID
     * @returns {Object|null} - 职能配置对象
     */
    getFunctionConfig(functionId) {
        const allFunctions = this.getAllFunctions();
        return allFunctions.find(f => f.id === functionId) || null;
    },

    /**
     * 添加需要均衡的职能
     * @param {string} functionId - 职能ID
     */
    addBalancedFunction(functionId) {
        const rules = this.getRules();
        if (!rules.balancedFunctions.includes(functionId)) {
            rules.balancedFunctions.push(functionId);
        }
    },

    /**
     * 移除需要均衡的职能
     * @param {string} functionId - 职能ID
     */
    removeBalancedFunction(functionId) {
        const rules = this.getRules();
        const index = rules.balancedFunctions.indexOf(functionId);
        if (index !== -1) {
            rules.balancedFunctions.splice(index, 1);
        }
    },

    /**
     * 批量设置需要均衡的职能
     * @param {Array} functionIds - 职能ID列表
     */
    setBalancedFunctions(functionIds) {
        const rules = this.getRules();
        rules.balancedFunctions = [...functionIds];
    },

    /**
     * 导出规则配置（用于备份）
     */
    exportRules() {
        const rules = this.getRules();
        return JSON.stringify(rules, null, 2);
    },

    /**
     * 导入规则配置（用于恢复）
     * @param {string} jsonRules - JSON格式的规则配置
     */
    importRules(jsonRules) {
        try {
            const rules = JSON.parse(jsonRules);
            this.currentRules = this.deepMerge(
                JSON.parse(JSON.stringify(this.defaultRules)),
                rules
            );
            return true;
        } catch (error) {
            console.error('导入职能均衡规则配置失败:', error);
            return false;
        }
    }
};

// 暴露到全局作用域
if (typeof window !== 'undefined') {
    window.FunctionBalanceRules = FunctionBalanceRules;
}
