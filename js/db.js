/**
 * IndexedDB 本地数据库存储模块
 * 使用 IndexedDB 作为轻型本地数据库，替代 localStorage
 */

const DB = {
    dbName: 'ShiftSchedulerDB',
    dbVersion: 5, // 增加版本号以触发升级（添加每日人力配置存储）
    db: null,

    /**
     * 初始化数据库
     * @returns {Promise<IDBDatabase>}
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('数据库打开失败:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('数据库打开成功');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const transaction = event.target.transaction;

                // 创建对象存储：应用状态
                if (!db.objectStoreNames.contains('appState')) {
                    const stateStore = db.createObjectStore('appState', { keyPath: 'id' });
                    stateStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // 创建对象存储：人员数据历史
                if (!db.objectStoreNames.contains('staffDataHistory')) {
                    const staffStore = db.createObjectStore('staffDataHistory', { keyPath: 'staffId' });
                    staffStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                }

                // 创建对象存储：配置记录
                if (!db.objectStoreNames.contains('staffConfigs')) {
                    const configStore = db.createObjectStore('staffConfigs', { keyPath: 'configId' });
                    configStore.createIndex('createdAt', 'createdAt', { unique: false });
                    configStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                }

                // 创建对象存储：积分计算公式配置
                if (!db.objectStoreNames.contains('scoreFormula')) {
                    db.createObjectStore('scoreFormula', { keyPath: 'id' });
                }

                // 创建对象存储：个性化需求配置记录
                if (!db.objectStoreNames.contains('requestConfigs')) {
                    const requestConfigStore = db.createObjectStore('requestConfigs', { keyPath: 'configId' });
                    requestConfigStore.createIndex('createdAt', 'createdAt', { unique: false });
                    requestConfigStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                }

                // 创建对象存储：休息日规则配置
                if (!db.objectStoreNames.contains('restDayRules')) {
                    db.createObjectStore('restDayRules', { keyPath: 'id' });
                }

                // 创建对象存储：夜班排班规则配置
                if (!db.objectStoreNames.contains('nightShiftRules')) {
                    db.createObjectStore('nightShiftRules', { keyPath: 'id' });
                }

                // 创建对象存储：白班排班规则配置
                if (!db.objectStoreNames.contains('dayShiftRules')) {
                    db.createObjectStore('dayShiftRules', { keyPath: 'id' });
                }

                // 创建对象存储：排班顺序和优先级规则配置
                if (!db.objectStoreNames.contains('schedulingRules')) {
                    db.createObjectStore('schedulingRules', { keyPath: 'id' });
                }

                // 创建对象存储：排班周期配置记录
                if (!db.objectStoreNames.contains('schedulePeriodConfigs')) {
                    const schedulePeriodConfigStore = db.createObjectStore('schedulePeriodConfigs', { keyPath: 'configId' });
                    schedulePeriodConfigStore.createIndex('createdAt', 'createdAt', { unique: false });
                    schedulePeriodConfigStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                }

                // 创建对象存储：每日人力配置
                if (!db.objectStoreNames.contains('dailyManpowerConfigs')) {
                    const dailyManpowerConfigStore = db.createObjectStore('dailyManpowerConfigs', { keyPath: 'configId' });
                    dailyManpowerConfigStore.createIndex('createdAt', 'createdAt', { unique: false });
                    dailyManpowerConfigStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                }

                console.log('数据库结构创建/更新完成');
            };
        });
    },

    /**
     * 保存应用状态
     * @param {Object} state - 状态对象
     */
    async saveAppState(state) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['appState'], 'readwrite');
            const store = transaction.objectStore('appState');
            
            const stateData = {
                id: 'main',
                data: state,
                timestamp: new Date().toISOString()
            };

            const request = store.put(stateData);

            request.onsuccess = () => {
                console.log('应用状态已保存到 IndexedDB');
                resolve();
            };

            request.onerror = () => {
                console.error('保存应用状态失败:', request.error);
                reject(request.error);
            };
        });
    },

    /**
     * 加载应用状态
     * @returns {Promise<Object|null>}
     */
    async loadAppState() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['appState'], 'readonly');
            const store = transaction.objectStore('appState');
            const request = store.get('main');

            request.onsuccess = () => {
                if (request.result) {
                    console.log('应用状态已从 IndexedDB 加载');
                    resolve(request.result.data);
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => {
                console.error('加载应用状态失败:', request.error);
                reject(request.error);
            };
        });
    },

    /**
     * 保存人员数据历史
     * @param {string} staffId - 人员ID
     * @param {Array} history - 历史记录数组
     */
    async saveStaffHistory(staffId, history) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['staffDataHistory'], 'readwrite');
            const store = transaction.objectStore('staffDataHistory');
            
            const data = {
                staffId: staffId,
                history: history,
                updatedAt: new Date().toISOString()
            };

            const request = store.put(data);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    },

    /**
     * 加载所有人员数据历史
     * @returns {Promise<Object>}
     */
    async loadAllStaffHistory() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['staffDataHistory'], 'readonly');
            const store = transaction.objectStore('staffDataHistory');
            const request = store.getAll();

            request.onsuccess = () => {
                const result = {};
                request.result.forEach(item => {
                    result[item.staffId] = item.history;
                });
                resolve(result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    },

    /**
     * 保存配置记录
     * @param {Object} config - 配置对象
     */
    async saveConfig(config) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['staffConfigs'], 'readwrite');
            const store = transaction.objectStore('staffConfigs');
            const request = store.put(config);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    },

    /**
     * 加载所有配置记录
     * @returns {Promise<Array>}
     */
    async loadAllConfigs() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['staffConfigs'], 'readonly');
            const store = transaction.objectStore('staffConfigs');
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result || []);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    },

    /**
     * 删除配置记录
     * @param {string} configId - 配置ID
     */
    async deleteConfig(configId) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['staffConfigs'], 'readwrite');
            const store = transaction.objectStore('staffConfigs');
            const request = store.delete(configId);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    },

    /**
     * 保存个性化需求配置记录
     * @param {Object} config - 配置对象
     */
    async saveRequestConfig(config) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['requestConfigs'], 'readwrite');
            const store = transaction.objectStore('requestConfigs');
            const request = store.put(config);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * 加载所有个性化需求配置记录
     * @returns {Promise<Array>}
     */
    async loadAllRequestConfigs() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['requestConfigs'], 'readonly');
            const store = transaction.objectStore('requestConfigs');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * 删除个性化需求配置记录
     * @param {string} configId - 配置ID
     */
    async deleteRequestConfig(configId) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['requestConfigs'], 'readwrite');
            const store = transaction.objectStore('requestConfigs');
            const request = store.delete(configId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * 保存排班周期配置记录
     * @param {Object} config - 配置对象
     */
    async saveSchedulePeriodConfig(config) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            if (!this.db.objectStoreNames.contains('schedulePeriodConfigs')) {
                resolve(); // 如果对象存储不存在，跳过保存（兼容旧版本）
                return;
            }
            
            const transaction = this.db.transaction(['schedulePeriodConfigs'], 'readwrite');
            const store = transaction.objectStore('schedulePeriodConfigs');
            const request = store.put(config);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * 加载所有排班周期配置记录
     * @returns {Promise<Array>}
     */
    async loadAllSchedulePeriodConfigs() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            if (!this.db.objectStoreNames.contains('schedulePeriodConfigs')) {
                resolve([]); // 如果对象存储不存在，返回空数组（兼容旧版本）
                return;
            }
            
            const transaction = this.db.transaction(['schedulePeriodConfigs'], 'readonly');
            const store = transaction.objectStore('schedulePeriodConfigs');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * 删除排班周期配置记录
     * @param {string} configId - 配置ID
     */
    async deleteSchedulePeriodConfig(configId) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            if (!this.db.objectStoreNames.contains('schedulePeriodConfigs')) {
                resolve(); // 如果对象存储不存在，跳过删除（兼容旧版本）
                return;
            }
            
            const transaction = this.db.transaction(['schedulePeriodConfigs'], 'readwrite');
            const store = transaction.objectStore('schedulePeriodConfigs');
            const request = store.delete(configId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * 保存积分计算公式配置
     * @param {Object} formula - 公式配置对象
     */
    async saveScoreFormula(formula) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['scoreFormula'], 'readwrite');
            const store = transaction.objectStore('scoreFormula');
            
            const data = {
                id: 'main',
                ...formula,
                updatedAt: new Date().toISOString()
            };

            const request = store.put(data);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    },

    /**
     * 加载积分计算公式配置
     * @returns {Promise<Object>}
     */
    async loadScoreFormula() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['scoreFormula'], 'readonly');
            const store = transaction.objectStore('scoreFormula');
            const request = store.get('main');

            request.onsuccess = () => {
                if (request.result) {
                    resolve(request.result);
                } else {
                    // 返回默认公式
                    resolve({
                        springFestivalCoeff: 10,  // 上年春节系数
                        nationalDayCoeff: 8,      // 上年国庆系数
                        currentHolidayCoeff: 5    // 当年节假系数
                    });
                }
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    },

    /**
     * 保存休息日规则配置
     * @param {Object} rules - 规则配置对象
     */
    async saveRestDayRules(rules) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            // 检查对象存储是否存在
            if (!this.db.objectStoreNames.contains('restDayRules')) {
                // 如果不存在，返回默认值（不保存）
                console.warn('restDayRules 对象存储不存在，使用默认规则');
                resolve();
                return;
            }

            const transaction = this.db.transaction(['restDayRules'], 'readwrite');
            const store = transaction.objectStore('restDayRules');
            
            const data = {
                id: 'main',
                ...rules,
                updatedAt: new Date().toISOString()
            };

            const request = store.put(data);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    },

    /**
     * 加载休息日规则配置
     * @returns {Promise<Object>}
     */
    async loadRestDayRules() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            // 检查对象存储是否存在
            if (!this.db.objectStoreNames.contains('restDayRules')) {
                // 返回默认规则
                resolve({
                    maxRestDays: 3,      // 指定休息日不可超过3天
                    maxWeekendRestDays: 2 // 周末指定不可超过2天
                });
                return;
            }

            const transaction = this.db.transaction(['restDayRules'], 'readonly');
            const store = transaction.objectStore('restDayRules');
            const request = store.get('main');

            request.onsuccess = () => {
                if (request.result) {
                    resolve(request.result);
                } else {
                    // 返回默认规则
                    resolve({
                        maxRestDays: 3,      // 指定休息日不可超过3天
                        maxWeekendRestDays: 2 // 周末指定不可超过2天
                    });
                }
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    },

    /**
     * 保存夜班排班规则配置
     */
    async saveNightShiftRules(rules) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            // 检查对象存储是否存在
            if (!this.db.objectStoreNames.contains('nightShiftRules')) {
                reject(new Error('nightShiftRules 对象存储不存在'));
                return;
            }

            const transaction = this.db.transaction(['nightShiftRules'], 'readwrite');
            const store = transaction.objectStore('nightShiftRules');
            
            const rulesData = {
                id: 'main',
                rules: rules,
                updatedAt: new Date().toISOString()
            };

            const request = store.put(rulesData);

            request.onsuccess = () => {
                console.log('夜班规则配置已保存');
                resolve();
            };

            request.onerror = () => {
                console.error('保存夜班规则配置失败:', request.error);
                reject(request.error);
            };
        });
    },

    /**
     * 加载夜班排班规则配置
     */
    async loadNightShiftRules() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            // 检查对象存储是否存在
            if (!this.db.objectStoreNames.contains('nightShiftRules')) {
                resolve(null);
                return;
            }

            const transaction = this.db.transaction(['nightShiftRules'], 'readonly');
            const store = transaction.objectStore('nightShiftRules');
            const request = store.get('main');

            request.onsuccess = () => {
                if (request.result && request.result.rules) {
                    resolve(request.result.rules);
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => {
                console.error('加载夜班规则配置失败:', request.error);
                reject(request.error);
            };
        });
    },

    /**
     * 保存白班排班规则配置
     */
    async saveDayShiftRules(rules) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            // 检查对象存储是否存在
            if (!this.db.objectStoreNames.contains('dayShiftRules')) {
                reject(new Error('dayShiftRules 对象存储不存在'));
                return;
            }

            const transaction = this.db.transaction(['dayShiftRules'], 'readwrite');
            const store = transaction.objectStore('dayShiftRules');
            
            const rulesData = {
                id: 'main',
                rules: rules,
                updatedAt: new Date().toISOString()
            };

            const request = store.put(rulesData);

            request.onsuccess = () => {
                console.log('白班规则配置已保存');
                resolve();
            };

            request.onerror = () => {
                console.error('保存白班规则配置失败:', request.error);
                reject(request.error);
            };
        });
    },

    /**
     * 加载白班排班规则配置
     */
    async loadDayShiftRules() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            // 检查对象存储是否存在
            if (!this.db.objectStoreNames.contains('dayShiftRules')) {
                resolve(null);
                return;
            }

            const transaction = this.db.transaction(['dayShiftRules'], 'readonly');
            const store = transaction.objectStore('dayShiftRules');
            const request = store.get('main');

            request.onsuccess = () => {
                if (request.result && request.result.rules) {
                    resolve(request.result.rules);
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => {
                console.error('加载白班规则配置失败:', request.error);
                reject(request.error);
            };
        });
    },

    /**
     * 保存每日人力配置
     * @param {Object} config - 配置对象
     */
    async saveDailyManpowerConfig(config) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            if (!this.db.objectStoreNames.contains('dailyManpowerConfigs')) {
                reject(new Error('dailyManpowerConfigs 对象存储不存在'));
                return;
            }

            const transaction = this.db.transaction(['dailyManpowerConfigs'], 'readwrite');
            const store = transaction.objectStore('dailyManpowerConfigs');
            
            const configData = {
                configId: config.configId || 'default',
                name: config.name || '默认配置',
                baseFunctions: config.baseFunctions || {},
                businessFunctions: config.businessFunctions || {},
                complexRules: config.complexRules || [],
                // 保存矩阵数据（重要：这是最新的数据格式）
                matrix: config.matrix || {},
                // 保存规则和变量
                rules: config.rules || [],
                customVars: config.customVars || [],
                groups: config.groups || [],
                createdAt: config.createdAt || new Date().toISOString(),
                updatedAt: config.updatedAt || new Date().toISOString()
            };

            const request = store.put(configData);

            request.onsuccess = () => {
                console.log('每日人力配置已保存');
                resolve();
            };

            request.onerror = () => {
                console.error('保存每日人力配置失败:', request.error);
                reject(request.error);
            };
        });
    },

    /**
     * 加载每日人力配置
     * @param {string} configId - 配置ID，默认为'default'
     * @returns {Promise<Object|null>}
     */
    async loadDailyManpowerConfig(configId = 'default') {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            if (!this.db.objectStoreNames.contains('dailyManpowerConfigs')) {
                resolve(null);
                return;
            }

            const transaction = this.db.transaction(['dailyManpowerConfigs'], 'readonly');
            const store = transaction.objectStore('dailyManpowerConfigs');
            const request = store.get(configId);

            request.onsuccess = () => {
                if (request.result) {
                    resolve(request.result);
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => {
                console.error('加载每日人力配置失败:', request.error);
                reject(request.error);
            };
        });
    },

    /**
     * 加载所有每日人力配置
     * @returns {Promise<Array>}
     */
    async loadAllDailyManpowerConfigs() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            if (!this.db.objectStoreNames.contains('dailyManpowerConfigs')) {
                resolve([]);
                return;
            }

            const transaction = this.db.transaction(['dailyManpowerConfigs'], 'readonly');
            const store = transaction.objectStore('dailyManpowerConfigs');
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result || []);
            };

            request.onerror = () => {
                console.error('加载所有每日人力配置失败:', request.error);
                reject(request.error);
            };
        });
    },

    /**
     * 删除每日人力配置
     * @param {string} configId - 配置ID
     */
    async deleteDailyManpowerConfig(configId) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            if (!this.db.objectStoreNames.contains('dailyManpowerConfigs')) {
                resolve();
                return;
            }
            
            const transaction = this.db.transaction(['dailyManpowerConfigs'], 'readwrite');
            const store = transaction.objectStore('dailyManpowerConfigs');
            const request = store.delete(configId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * 保存排班顺序和优先级规则配置
     */
    async saveSchedulingRules(rules) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            // 检查对象存储是否存在
            if (!this.db.objectStoreNames.contains('schedulingRules')) {
                reject(new Error('schedulingRules 对象存储不存在'));
                return;
            }

            const transaction = this.db.transaction(['schedulingRules'], 'readwrite');
            const store = transaction.objectStore('schedulingRules');
            
            const rulesData = {
                id: 'main',
                rules: rules,
                updatedAt: new Date().toISOString()
            };

            const request = store.put(rulesData);

            request.onsuccess = () => {
                console.log('排班规则配置已保存');
                resolve();
            };

            request.onerror = () => {
                console.error('保存排班规则配置失败:', request.error);
                reject(request.error);
            };
        });
    },

    /**
     * 加载排班顺序和优先级规则配置
     */
    async loadSchedulingRules() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            // 检查对象存储是否存在
            if (!this.db.objectStoreNames.contains('schedulingRules')) {
                resolve(null);
                return;
            }

            const transaction = this.db.transaction(['schedulingRules'], 'readonly');
            const store = transaction.objectStore('schedulingRules');
            const request = store.get('main');

            request.onsuccess = () => {
                if (request.result && request.result.rules) {
                    resolve(request.result.rules);
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => {
                console.error('加载排班规则配置失败:', request.error);
                reject(request.error);
            };
        });
    },

    /**
     * 清空所有数据
     */
    async clearAll() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const stores = ['appState', 'staffDataHistory', 'staffConfigs', 'requestConfigs', 'scoreFormula'];
            if (this.db.objectStoreNames.contains('restDayRules')) {
                stores.push('restDayRules');
            }
            const transaction = this.db.transaction(stores, 'readwrite');

            let completed = 0;
            const total = stores.length;

            const checkComplete = () => {
                completed++;
                if (completed === total) {
                    console.log('所有数据已清空');
                    resolve();
                }
            };

            transaction.objectStore('appState').clear().onsuccess = checkComplete;
            transaction.objectStore('staffDataHistory').clear().onsuccess = checkComplete;
            transaction.objectStore('staffConfigs').clear().onsuccess = checkComplete;
            transaction.objectStore('requestConfigs').clear().onsuccess = checkComplete;
            transaction.objectStore('scoreFormula').clear().onsuccess = checkComplete;
            if (this.db.objectStoreNames.contains('restDayRules')) {
                transaction.objectStore('restDayRules').clear().onsuccess = checkComplete;
            } else {
                checkComplete();
            }

            transaction.onerror = () => {
                reject(transaction.error);
            };
        });
    },

    /**
     * 导出所有数据为 JSON 并保存到 database 目录
     */
    async exportToFile() {
        if (!this.db) {
            await this.init();
        }

        try {
            // 获取所有数据
            const appState = await this.loadAppState();
            const staffHistory = await this.loadAllStaffHistory();
            const configs = await this.loadAllConfigs();
            const requestConfigs = await this.loadAllRequestConfigs();
            const scoreFormula = await this.loadScoreFormula();
            
            // 加载休息日规则配置
            let restDayRules = null;
            try {
                restDayRules = await this.loadRestDayRules();
            } catch (error) {
                console.warn('加载休息日规则失败:', error);
                restDayRules = { maxRestDays: 3, maxWeekendRestDays: 2 };
            }

            const allData = {
                appState: appState || {},
                staffDataHistory: staffHistory || {},
                staffConfigs: configs || [],
                requestConfigs: requestConfigs || [],
                scoreFormula: scoreFormula || {},
                restDayRules: restDayRules || {},
                exportTime: new Date().toISOString()
            };

            const jsonData = JSON.stringify(allData, null, 2);
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'database/shiftscheduler.json';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            console.log('数据已导出到 database/shiftscheduler.json');
            return allData;
        } catch (error) {
            console.error('导出数据失败:', error);
            throw error;
        }
    },

    /**
     * 从文件导入数据
     * @param {File|Object} fileOrData - JSON 文件对象或已解析的JSON数据对象
     */
    async importFromFile(fileOrData) {
        if (!this.db) {
            await this.init();
        }

        try {
            let data;
            
            // 如果传入的是文件对象，读取并解析
            if (fileOrData instanceof File) {
                const text = await fileOrData.text();
                data = JSON.parse(text);
            } 
            // 如果传入的是已解析的数据对象，直接使用
            else if (typeof fileOrData === 'object' && fileOrData !== null) {
                data = fileOrData;
            } 
            else {
                throw new Error('无效的数据格式');
            }

            // 导入应用状态
            if (data.appState) {
                await this.saveAppState(data.appState);
            }

            // 导入人员数据历史
            if (data.staffDataHistory) {
                for (const [staffId, history] of Object.entries(data.staffDataHistory)) {
                    await this.saveStaffHistory(staffId, history);
                }
            }

            // 导入配置记录
            if (data.staffConfigs) {
                for (const config of data.staffConfigs) {
                    await this.saveConfig(config);
                }
            }

            // 导入个性化需求配置记录
            if (data.requestConfigs) {
                for (const config of data.requestConfigs) {
                    await this.saveRequestConfig(config);
                }
            }

            // 导入积分公式
            if (data.scoreFormula) {
                await this.saveScoreFormula(data.scoreFormula);
            }

            // 导入休息日规则配置
            if (data.restDayRules) {
                await this.saveRestDayRules(data.restDayRules);
            }

            console.log('数据已从文件导入');
        } catch (error) {
            console.error('导入数据失败:', error);
            throw error;
        }
    }
};

// 数据库初始化由 app.js 统一管理，避免重复初始化
// 如果需要手动初始化，可以调用 DB.init()

// 导出（如果使用模块系统）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DB;
}

