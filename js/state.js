/**
 * 状态管理模块 - 负责应用状态的管理和持久化
 */

const Store = {
    // 状态数据
    state: {
        // 人员数据（按ID组织，每个ID包含历史记录数组）
        // 格式: { "staffId": [{ data, createdAt, expiresAt, isValid, versionId }, ...] }
        staffDataHistory: {},
        // 人员配置记录（多个配置快照）
        // 格式: [{ configId, name, staffDataSnapshot, createdAt, updatedAt }, ...]
        staffConfigs: [],
        // 当前激活的配置ID
        activeConfigId: null,
        // 排班配置（日期范围等）
        scheduleConfig: {
            startDate: null,
            endDate: null,
            year: null,
            month: null
        },
        // 约束条件（休假需求等）
        constraints: [],
        // 个人休假需求（个性化需求录入）
        // 格式: { "staffId": { "YYYY-MM-DD": "REQ", ... }, ... }
        personalRequests: {},
        // 个性化需求配置记录（多个配置快照）
        // 格式: [{ configId, name, personalRequestsSnapshot, createdAt, updatedAt }, ...]
        requestConfigs: [],
        // 当前激活的需求配置ID
        activeRequestConfigId: null,
        // 排班周期配置记录（多个配置快照）
        // 格式: [{ configId, name, scheduleConfig, restDaysSnapshot, schedulePeriod, createdAt, updatedAt }, ...]
        schedulePeriodConfigs: [],
        // 当前激活的排班周期配置ID
        activeSchedulePeriodConfigId: null,
        // 当前激活的排版配置ID
        activeDailyManpowerConfigId: null,
        // 法定休息日配置（当前周期）
        // 格式: { "YYYY-MM-DD": true/false, ... } true表示休息日，false表示工作日
        restDays: {},
        // 最终排班结果
        finalSchedule: null,
        // 当前视图状态（用于页面刷新后恢复视图）
        // 可选值: 'schedule', 'staff', 'request'
        currentView: 'schedule',
        // 当前子视图状态（用于恢复子页面）
        // StaffManager: 'configs' | 'staffList'
        // RequestManager: 'configs' | 'requestList'
        currentSubView: null,
        // 当前查看的配置ID（用于恢复子页面）
        currentConfigId: null
    },

    /**
     * 获取状态
     * @param {string} key - 状态键名（可选，不传则返回整个状态）
     * @returns {*} 状态值或整个状态对象
     */
    getState(key) {
        if (key) {
            return this.state[key];
        }
        return this.state;
    },

    /**
     * 获取当前有效的人员数据列表
     * @returns {Array} 当前有效的人员数据数组
     */
    getCurrentStaffData() {
        const now = new Date().toISOString();
        const staffList = [];
        
        Object.keys(this.state.staffDataHistory).forEach(staffId => {
            const history = this.state.staffDataHistory[staffId];
            // 找到当前有效的记录（最新的有效记录）
            const validRecords = history.filter(record => {
                if (!record.isValid) return false;
                if (record.expiresAt && record.expiresAt < now) return false;
                return true;
            });
            
            if (validRecords.length > 0) {
                // 获取最新的有效记录
                const latest = validRecords.sort((a, b) => 
                    new Date(b.createdAt) - new Date(a.createdAt)
                )[0];
                staffList.push({
                    ...latest.data,
                    staffId: staffId,
                    versionId: latest.versionId,
                    createdAt: latest.createdAt,
                    expiresAt: latest.expiresAt
                });
            }
        });
        
        return staffList;
    },

    /**
     * 获取指定人员的历史记录
     * @param {string} staffId - 人员ID
     * @returns {Array} 历史记录数组
     */
    getStaffHistory(staffId) {
        return this.state.staffDataHistory[staffId] || [];
    },

    /**
     * 添加或更新人员数据（创建新版本）
     * @param {Object} staffData - 人员数据对象
     * @param {string} expiresAt - 失效时间（ISO字符串，可选）
     * @returns {string} 版本ID
     */
    addStaffData(staffData, expiresAt = null, autoSave = false) {
        const staffId = staffData.id;
        if (!staffId) {
            throw new Error('人员数据必须包含ID');
        }

        // 如果不存在，创建空数组
        if (!this.state.staffDataHistory[staffId]) {
            this.state.staffDataHistory[staffId] = [];
        }

        // 生成版本ID
        const versionId = `v${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();

        // 使旧版本失效（如果上传新数据）
        if (expiresAt === null) {
            // 默认：新数据上传时，旧数据自动失效
            this.state.staffDataHistory[staffId].forEach(record => {
                if (record.isValid && (!record.expiresAt || record.expiresAt > now)) {
                    record.isValid = false;
                }
            });
        }

        // 添加新记录
        const newRecord = {
            data: { ...staffData },
            createdAt: now,
            expiresAt: expiresAt,
            isValid: true,
            versionId: versionId
        };

        this.state.staffDataHistory[staffId].push(newRecord);

        // 只有在明确要求时才保存（默认不保存，避免实时保存）
        if (autoSave) {
            this.saveState();
        }

        return versionId;
    },

    /**
     * 批量添加人员数据（从Excel导入）
     * @param {Array<Object>} staffList - 人员数据数组
     * @param {string} expiresAt - 失效时间（ISO字符串，可选）
     */
    batchAddStaffData(staffList, expiresAt = null) {
        const now = new Date().toISOString();
        const versionId = `batch_${Date.now()}`;

        staffList.forEach(staff => {
            const staffId = staff.id;
            if (!staffId) return;

            // 如果不存在，创建空数组
            if (!this.state.staffDataHistory[staffId]) {
                this.state.staffDataHistory[staffId] = [];
            }

            // 使旧版本失效（如果上传新数据且未指定失效时间）
            if (expiresAt === null) {
                this.state.staffDataHistory[staffId].forEach(record => {
                    if (record.isValid && (!record.expiresAt || record.expiresAt > now)) {
                        record.isValid = false;
                    }
                });
            }

            // 添加新记录
            const newRecord = {
                data: { ...staff },
                createdAt: now,
                expiresAt: expiresAt,
                isValid: true,
                versionId: `${versionId}_${staffId}`
            };

            this.state.staffDataHistory[staffId].push(newRecord);
        });

        this.saveState();
    },

    /**
     * 更新历史记录
     * @param {string} staffId - 人员ID
     * @param {string} versionId - 版本ID
     * @param {Object} updates - 要更新的数据
     * @param {string} expiresAt - 新的失效时间（可选）
     */
    updateStaffHistory(staffId, versionId, updates, expiresAt = null, autoSave = false) {
        if (!this.state.staffDataHistory[staffId]) {
            throw new Error('人员不存在');
        }

        const record = this.state.staffDataHistory[staffId].find(r => r.versionId === versionId);
        if (!record) {
            throw new Error('版本记录不存在');
        }

        // 更新数据
        Object.assign(record.data, updates);

        // 更新失效时间
        if (expiresAt !== null) {
            record.expiresAt = expiresAt;
        }

        // 只有在明确要求时才保存（默认不保存，避免实时保存）
        if (autoSave) {
            this.saveState();
        }
    },

    /**
     * 设置历史记录的失效时间
     * @param {string} staffId - 人员ID
     * @param {string} versionId - 版本ID
     * @param {string} expiresAt - 失效时间（ISO字符串）
     */
    setHistoryExpiresAt(staffId, versionId, expiresAt, autoSave = false) {
        if (!this.state.staffDataHistory[staffId]) {
            throw new Error('人员不存在');
        }

        const record = this.state.staffDataHistory[staffId].find(r => r.versionId === versionId);
        if (!record) {
            throw new Error('版本记录不存在');
        }

        record.expiresAt = expiresAt;

        // 只有在明确要求时才保存（默认不保存，避免实时保存）
        if (autoSave) {
            this.saveState();
        }
    },

    /**
     * 创建新的配置记录
     * @param {string} name - 配置名称（可选，默认自动生成）
     * @returns {string} 配置ID
     */
    createStaffConfig(name = null) {
        const now = new Date();
        const configId = `config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // 生成默认名称：使用排班周期的结束月份作为前缀，保留时间戳后缀
        // 格式：YYYYMM_人员配置_YYMMDD_HHMMSS（使用排班周期的结束月份 + 当前时间戳）
        if (!name) {
            const scheduleConfig = this.state.scheduleConfig;
            let year, month;
            
            // 如果有排班周期配置，使用排班周期的结束月份
            if (scheduleConfig && scheduleConfig.endDate) {
                const scheduleEndDate = new Date(scheduleConfig.endDate);
                year = scheduleEndDate.getFullYear();
                month = String(scheduleEndDate.getMonth() + 1).padStart(2, '0');
            } else {
                // 如果没有排班周期配置，使用当前日期
                year = now.getFullYear();
                month = String(now.getMonth() + 1).padStart(2, '0');
            }
            
            const day = String(now.getDate()).padStart(2, '0');
            const hour = String(now.getHours()).padStart(2, '0');
            const minute = String(now.getMinutes()).padStart(2, '0');
            const second = String(now.getSeconds()).padStart(2, '0');
            const createYear = now.getFullYear();
            const createMonth = String(now.getMonth() + 1).padStart(2, '0');
            // 格式：YYYYMM-人员配置-YYYYMMDD-HHmmss（排班周期年月-人员配置-创建时间）
            name = `${year}${month}-人员配置-${createYear}${createMonth}${day}-${hour}${minute}${second}`;
        }

        // 获取当前人员数据快照
        const currentStaff = this.getCurrentStaffData();
        
        const config = {
            configId: configId,
            name: name,
            staffDataSnapshot: JSON.parse(JSON.stringify(currentStaff)), // 深拷贝
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };

        this.state.staffConfigs.push(config);
        this.state.activeConfigId = configId;
        this.saveState();

        return configId;
    },

    /**
     * 获取所有配置记录
     * @returns {Array} 配置记录数组
     */
    getStaffConfigs() {
        return this.state.staffConfigs || [];
    },

    /**
     * 获取指定配置记录
     * @param {string} configId - 配置ID
     * @returns {Object} 配置记录
     */
    getStaffConfig(configId) {
        return this.state.staffConfigs.find(c => c.configId === configId);
    },

    /**
     * 更新配置记录
     * @param {string} configId - 配置ID
     * @param {Object} updates - 更新内容
     */
    updateStaffConfig(configId, updates, autoSave = false) {
        const config = this.state.staffConfigs.find(c => c.configId === configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }

        // 更新配置
        Object.assign(config, updates);
        config.updatedAt = new Date().toISOString();

        // 如果更新了人员数据，更新快照
        if (updates.staffDataSnapshot) {
            config.staffDataSnapshot = JSON.parse(JSON.stringify(updates.staffDataSnapshot));
        }

        // 只有在明确要求时才保存（默认不保存，避免实时保存）
        if (autoSave) {
            this.saveState();
        }
    },

    /**
     * 删除配置记录（允许删除激活状态的配置，如果是最后一条会自动取消激活）
     * @param {string} configId - 配置ID
     */
    deleteStaffConfig(configId) {
        const config = this.getStaffConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }

        // 如果是激活状态的配置，先取消激活
        if (this.state.activeConfigId === configId) {
            this.state.activeConfigId = null;
        }

        const index = this.state.staffConfigs.findIndex(c => c.configId === configId);
        this.state.staffConfigs.splice(index, 1);
        this.saveState();
    },

    /**
     * 复制配置记录
     * @param {string} configId - 要复制的配置ID
     * @param {string} newName - 新配置名称（可选）
     * @returns {string} 新配置ID
     */
    duplicateStaffConfig(configId, newName = null) {
        const sourceConfig = this.getStaffConfig(configId);
        if (!sourceConfig) {
            throw new Error('配置记录不存在');
        }

        const now = new Date();
        const newConfigId = `config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        if (!newName) {
            newName = `${sourceConfig.name} (副本)`;
        }

        const newConfig = {
            configId: newConfigId,
            name: newName,
            staffDataSnapshot: JSON.parse(JSON.stringify(sourceConfig.staffDataSnapshot)), // 深拷贝
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };

        this.state.staffConfigs.push(newConfig);
        // 复制后的配置自动为非激活状态（不设置activeConfigId）
        this.saveState();

        return newConfigId;
    },

    /**
     * 设置激活的配置（自动将其他设置为非激活）
     * @param {string} configId - 配置ID
     */
    async setActiveConfig(configId) {
        if (!this.getStaffConfig(configId)) {
            throw new Error('配置记录不存在');
        }
        // 确保只有一个激活：将当前激活的设置为非激活
        this.state.activeConfigId = configId;
        // 等待保存完成，确保激活状态被持久化
        await this.saveState();
    },

    /**
     * 设置状态
     * @param {string} key - 状态键名
     * @param {*} value - 状态值
     */
    setState(key, value) {
        this.state[key] = value;
        // 状态变更后自动保存
        this.saveState();
    },

    /**
     * 更新状态（部分更新）
     * @param {Object} updates - 要更新的键值对
     */
    updateState(updates, autoSave = true) {
        Object.assign(this.state, updates);
        // 状态变更后自动保存（除非明确指定不保存）
        if (autoSave) {
            this.saveState();
        }
    },

    /**
     * 设置个人休假需求
     * @param {string} staffId - 人员ID
     * @param {string} date - 日期（YYYY-MM-DD格式）
     * @param {string} status - 状态（'REQ' 或 ''）
     */
    setPersonalRequest(staffId, date, status) {
        if (!this.state.personalRequests[staffId]) {
            this.state.personalRequests[staffId] = {};
        }
        
        if (status === 'REQ') {
            this.state.personalRequests[staffId][date] = 'REQ';
        } else {
            // 删除该日期的请求
            delete this.state.personalRequests[staffId][date];
            // 如果该员工没有任何请求了，删除整个对象
            if (Object.keys(this.state.personalRequests[staffId]).length === 0) {
                delete this.state.personalRequests[staffId];
            }
        }
        
        this.saveState();
    },

    /**
     * 批量设置个人休假需求
     * @param {string} staffId - 人员ID
     * @param {Object} requests - 休假需求对象，格式：{ "YYYY-MM-DD": "REQ", ... }
     */
    setPersonalRequests(staffId, requests) {
        this.state.personalRequests[staffId] = requests || {};
        this.saveState();
    },

    /**
     * 获取个人休假需求
     * @param {string} staffId - 人员ID
     * @returns {Object} 休假需求对象
     */
    getPersonalRequests(staffId) {
        return this.state.personalRequests[staffId] || {};
    },

    /**
     * 获取所有个人休假需求
     * @returns {Object} 所有人员的休假需求
     */
    getAllPersonalRequests() {
        return this.state.personalRequests || {};
    },

    /**
     * 获取个性化需求配置列表
     */
    getRequestConfigs() {
        return this.state.requestConfigs || [];
    },

    /**
     * 获取指定需求配置
     */
    getRequestConfig(configId) {
        return (this.state.requestConfigs || []).find(c => c.configId === configId) || null;
    },

    /**
     * 创建个性化需求配置
     */
    createRequestConfig(name, personalRequests, restDays = {}) {
        const now = new Date();
        const configId = `request_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newConfig = {
            configId,
            name,
            personalRequestsSnapshot: JSON.parse(JSON.stringify(personalRequests || {})),
            restDaysSnapshot: JSON.parse(JSON.stringify(restDays || {})),
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };
        this.state.requestConfigs.push(newConfig);
        this.saveState();
        return configId;
    },

    /**
     * 更新需求配置
     */
    updateRequestConfig(configId, updates, autoSave = false) {
        const config = this.getRequestConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        Object.assign(config, updates);
        config.updatedAt = new Date().toISOString();
        
        // 只有在明确要求时才保存（默认不保存，避免实时保存）
        if (autoSave) {
            this.saveState();
        }
    },

    /**
     * 删除需求配置
     */
    deleteRequestConfig(configId) {
        const config = this.getRequestConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        if (this.state.activeRequestConfigId === configId) {
            this.state.activeRequestConfigId = null;
        }
        this.state.requestConfigs = (this.state.requestConfigs || []).filter(c => c.configId !== configId);
        this.saveState();
    },

    /**
     * 复制需求配置
     */
    duplicateRequestConfig(configId, newName = null) {
        const source = this.getRequestConfig(configId);
        if (!source) {
            throw new Error('配置记录不存在');
        }
        const now = new Date();
        const newConfigId = `request_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const copy = {
            configId: newConfigId,
            name: newName || `${source.name} (副本)`,
            personalRequestsSnapshot: JSON.parse(JSON.stringify(source.personalRequestsSnapshot || {})),
            restDaysSnapshot: JSON.parse(JSON.stringify(source.restDaysSnapshot || {})),
            schedulePeriod: source.schedulePeriod || null,
            scheduleConfig: source.scheduleConfig ? JSON.parse(JSON.stringify(source.scheduleConfig)) : null,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };
        this.state.requestConfigs.push(copy);
        this.saveState();
        return newConfigId;
    },

    /**
     * 设置激活需求配置
     */
    async setActiveRequestConfig(configId) {
        const config = this.getRequestConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        this.state.activeRequestConfigId = configId;
        this.state.personalRequests = JSON.parse(JSON.stringify(config.personalRequestsSnapshot || {}));
        this.state.restDays = JSON.parse(JSON.stringify(config.restDaysSnapshot || {}));
        // 等待保存完成，确保激活状态被持久化
        await this.saveState();
    },

    /**
     * 获取排班周期配置列表
     */
    getSchedulePeriodConfigs() {
        return this.state.schedulePeriodConfigs || [];
    },

    /**
     * 获取指定排班周期配置
     */
    getSchedulePeriodConfig(configId) {
        return (this.state.schedulePeriodConfigs || []).find(c => c.configId === configId) || null;
    },

    /**
     * 创建排班周期配置
     */
    createSchedulePeriodConfig(name, scheduleConfig, restDays = {}) {
        const now = new Date();
        const configId = `schedule_period_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newConfig = {
            configId,
            name,
            scheduleConfig: scheduleConfig ? JSON.parse(JSON.stringify(scheduleConfig)) : null,
            restDaysSnapshot: JSON.parse(JSON.stringify(restDays || {})),
            schedulePeriod: scheduleConfig && scheduleConfig.startDate && scheduleConfig.endDate
                ? `${scheduleConfig.startDate} 至 ${scheduleConfig.endDate}`
                : null,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };
        this.state.schedulePeriodConfigs.push(newConfig);
        this.saveState();
        return configId;
    },

    /**
     * 更新排班周期配置
     */
    updateSchedulePeriodConfig(configId, updates, autoSave = false) {
        const config = this.getSchedulePeriodConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        Object.assign(config, updates);
        config.updatedAt = new Date().toISOString();
        
        if (autoSave) {
            this.saveState();
        }
    },

    /**
     * 删除排班周期配置
     */
    deleteSchedulePeriodConfig(configId) {
        const config = this.getSchedulePeriodConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        if (this.state.activeSchedulePeriodConfigId === configId) {
            this.state.activeSchedulePeriodConfigId = null;
            // 取消激活时，清空排班周期配置
            this.state.scheduleConfig = null;
            this.state.restDays = {};
        }
        this.state.schedulePeriodConfigs = (this.state.schedulePeriodConfigs || []).filter(c => c.configId !== configId);
        this.saveState();
        
        // 实时更新排班周期控件
        if (typeof ScheduleLockManager !== 'undefined' && ScheduleLockManager.updateScheduleControlsState) {
            setTimeout(() => {
                ScheduleLockManager.updateScheduleControlsState();
            }, 50);
        }
    },

    /**
     * 设置激活的排班周期配置
     */
    async setActiveSchedulePeriodConfig(configId) {
        const config = this.getSchedulePeriodConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        this.state.activeSchedulePeriodConfigId = configId;
        
        // 加载配置的排班周期和休息日
        if (config.scheduleConfig) {
            this.state.scheduleConfig = JSON.parse(JSON.stringify(config.scheduleConfig));
        }
        if (config.restDaysSnapshot) {
            this.state.restDays = JSON.parse(JSON.stringify(config.restDaysSnapshot));
        }
        
        this.saveState();
        
        // 实时更新排班周期控件
        if (typeof ScheduleLockManager !== 'undefined' && ScheduleLockManager.updateScheduleControlsState) {
            setTimeout(() => {
                ScheduleLockManager.updateScheduleControlsState();
            }, 50);
        }
    },

    /**
     * 设置法定休息日
     */
    setRestDay(dateStr, isRestDay) {
        if (!this.state.restDays) {
            this.state.restDays = {};
        }
        if (isRestDay) {
            this.state.restDays[dateStr] = true;
        } else {
            delete this.state.restDays[dateStr];
        }
        this.saveState();
    },

    /**
     * 判断休息日
     */
    isRestDay(dateStr) {
        return this.state.restDays && this.state.restDays[dateStr] === true;
    },

    /**
     * 获取所有休息日
     */
    getAllRestDays() {
        return this.state.restDays || {};
    },

    /**
     * 保存状态到 IndexedDB
     */
    async saveState(saveToFile = false) {
        try {
            // 保存到IndexedDB
            if (typeof DB !== 'undefined' && DB.db) {
                // 使用 Promise.all 并行保存，提高性能
                const savePromises = [];
                
                // 保存应用状态（确保包含激活状态）
                console.log('saveState: 保存前的激活状态 - activeConfigId:', this.state.activeConfigId, 'activeRequestConfigId:', this.state.activeRequestConfigId);
                savePromises.push(DB.saveAppState(this.state));
                
                // 批量保存人员数据历史（并行执行）
                const staffHistoryPromises = Object.entries(this.state.staffDataHistory).map(
                    ([staffId, history]) => DB.saveStaffHistory(staffId, history)
                );
                savePromises.push(...staffHistoryPromises);
                
                // 批量保存配置记录（并行执行）
                const staffConfigPromises = this.state.staffConfigs.map(
                    config => DB.saveConfig(config)
                );
                savePromises.push(...staffConfigPromises);

                // 批量保存个性化需求配置记录（并行执行）
                const requestConfigPromises = this.state.requestConfigs.map(
                    config => DB.saveRequestConfig(config)
                );
                savePromises.push(...requestConfigPromises);
                
                // 批量保存排班周期配置记录（并行执行）
                const schedulePeriodConfigPromises = (this.state.schedulePeriodConfigs || []).map(
                    config => DB.saveSchedulePeriodConfig(config)
                );
                savePromises.push(...schedulePeriodConfigPromises);
                
                // 等待所有保存操作完成
                await Promise.all(savePromises);
                
                console.log('状态已保存到 IndexedDB');
                
                // 只有在明确要求时才导出到文件
                if (saveToFile) {
                    try {
                        await DB.exportToFile();
                        console.log('数据已导出到本地文件');
                    } catch (exportError) {
                        console.warn('导出到文件失败，但数据已保存到 IndexedDB:', exportError);
                        throw exportError;
                    }
                }
            }
        } catch (error) {
            console.error('保存状态失败:', error);
            throw error;
        }
    },

    /**
     * 从 IndexedDB 加载状态
     */
    async loadState() {
        try {
            // 从IndexedDB加载
            if (typeof DB !== 'undefined' && DB.db) {
                const loadedState = await DB.loadAppState();
                const staffHistory = await DB.loadAllStaffHistory();
                const configs = await DB.loadAllConfigs();
                const requestConfigs = await DB.loadAllRequestConfigs();
                const schedulePeriodConfigs = await DB.loadAllSchedulePeriodConfigs();
                
                // 检查浏览器存储是否有数据
                const hasBrowserData = loadedState || (staffHistory && Object.keys(staffHistory).length > 0) || (configs && configs.length > 0) || (requestConfigs && requestConfigs.length > 0) || (schedulePeriodConfigs && schedulePeriodConfigs.length > 0);
                
                if (hasBrowserData) {
                    // 浏览器有数据，使用浏览器数据
                    if (loadedState) {
                        // 加载人员数据历史
                        if (staffHistory && Object.keys(staffHistory).length > 0) {
                            loadedState.staffDataHistory = staffHistory;
                        }
                        
                        // 加载配置记录
                        if (configs && configs.length > 0) {
                            loadedState.staffConfigs = configs;
                        }
                        
                        // 加载个性化需求配置记录
                        if (requestConfigs && requestConfigs.length > 0) {
                            loadedState.requestConfigs = requestConfigs;
                        }
                        
                        // 加载排班周期配置记录
                        if (schedulePeriodConfigs && schedulePeriodConfigs.length > 0) {
                            loadedState.schedulePeriodConfigs = schedulePeriodConfigs;
                        }
                        
                        // 先保存激活状态，避免被覆盖
                        const savedActiveConfigId = loadedState.activeConfigId;
                        const savedActiveRequestConfigId = loadedState.activeRequestConfigId;
                        const savedActiveSchedulePeriodConfigId = loadedState.activeSchedulePeriodConfigId;
                        
                        console.log('loadState: 从IndexedDB加载的状态:', {
                            activeConfigId: savedActiveConfigId,
                            activeRequestConfigId: savedActiveRequestConfigId,
                            hasActiveConfigId: savedActiveConfigId !== undefined && savedActiveConfigId !== null,
                            hasActiveRequestConfigId: savedActiveRequestConfigId !== undefined && savedActiveRequestConfigId !== null,
                            loadedStateKeys: Object.keys(loadedState),
                            loadedStateActiveConfigId: loadedState.activeConfigId,
                            loadedStateActiveRequestConfigId: loadedState.activeRequestConfigId
                        });
                        
                        // 合并加载的状态，保留默认值
                        // 注意：Object.assign 会覆盖 this.state 中的值，所以我们需要在合并后恢复激活状态
                        this.state = Object.assign({}, this.state, loadedState);
                        
                        // 确保激活状态正确恢复（优先使用加载的值，如果加载的值是 null 或 undefined，也要保留）
                        // 注意：null 和 undefined 的区别 - null 表示明确设置为空，undefined 表示未定义
                        if (savedActiveConfigId !== undefined) {
                            // 如果加载的状态中有 activeConfigId（包括 null），使用加载的值
                            this.state.activeConfigId = savedActiveConfigId;
                            console.log('loadState: 恢复 activeConfigId =', savedActiveConfigId);
                        } else {
                            // 如果加载的状态中没有 activeConfigId，保持当前值（可能是默认的 null）
                            console.log('loadState: loadedState 中没有 activeConfigId，保持当前值:', this.state.activeConfigId);
                        }
                        
                        if (savedActiveRequestConfigId !== undefined) {
                            // 如果加载的状态中有 activeRequestConfigId（包括 null），使用加载的值
                            this.state.activeRequestConfigId = savedActiveRequestConfigId;
                            console.log('loadState: 恢复 activeRequestConfigId =', savedActiveRequestConfigId);
                        } else {
                            // 如果加载的状态中没有 activeRequestConfigId，保持当前值（可能是默认的 null）
                            console.log('loadState: loadedState 中没有 activeRequestConfigId，保持当前值:', this.state.activeRequestConfigId);
                        }
                        
                        // 确保激活状态正确恢复
                        console.log('loadState: 恢复激活状态后 - activeConfigId:', this.state.activeConfigId, 'activeRequestConfigId:', this.state.activeRequestConfigId);
                        
                        // 确保新增字段有默认值（兼容旧数据）
                        if (!this.state.currentView) {
                            this.state.currentView = 'schedule';
                        }
                        if (this.state.currentSubView === undefined) {
                            this.state.currentSubView = null;
                        }
                        if (this.state.currentConfigId === undefined) {
                            this.state.currentConfigId = null;
                        }
                        
                        // 确保激活状态字段存在（兼容旧数据）
                        // 注意：只有在加载的状态中没有定义时才设置为null，如果加载的状态中是null，也要保留
                        if (savedActiveConfigId === undefined && this.state.activeConfigId === undefined) {
                            this.state.activeConfigId = null;
                        }
                        if (savedActiveRequestConfigId === undefined && this.state.activeRequestConfigId === undefined) {
                            this.state.activeRequestConfigId = null;
                        }
                        
                        // 最终确认激活状态
                        console.log('loadState: 最终激活状态 - activeConfigId:', this.state.activeConfigId, 'activeRequestConfigId:', this.state.activeRequestConfigId);
                    } else {
                        // 只有部分数据，也要合并
                        if (staffHistory && Object.keys(staffHistory).length > 0) {
                            this.state.staffDataHistory = staffHistory;
                        }
                        if (configs && configs.length > 0) {
                            this.state.staffConfigs = configs;
                        }
                        if (requestConfigs && requestConfigs.length > 0) {
                            this.state.requestConfigs = requestConfigs;
                        }
                        if (schedulePeriodConfigs && schedulePeriodConfigs.length > 0) {
                            this.state.schedulePeriodConfigs = schedulePeriodConfigs;
                        }
                    }
                    console.log('状态已从 IndexedDB 恢复');
                    return true;
                } else {
                    // 浏览器存储为空，尝试从本地文件加载
                    try {
                        const response = await fetch('database/shiftscheduler.json');
                        if (response && response.ok) {
                            const fileData = await response.json();
                            
                            // 导入应用状态
                            if (fileData.appState) {
                                await DB.saveAppState(fileData.appState);
                                this.state = Object.assign({}, this.state, fileData.appState);
                                
                                // 确保新增字段有默认值（兼容旧数据）
                                if (!this.state.currentView) {
                                    this.state.currentView = 'schedule';
                                }
                                if (this.state.currentSubView === undefined) {
                                    this.state.currentSubView = null;
                                }
                                if (this.state.currentConfigId === undefined) {
                                    this.state.currentConfigId = null;
                                }
                            }
                            
                            // 导入人员数据历史
                            if (fileData.staffDataHistory) {
                                for (const staffId in fileData.staffDataHistory) {
                                    if (fileData.staffDataHistory.hasOwnProperty(staffId)) {
                                        await DB.saveStaffHistory(staffId, fileData.staffDataHistory[staffId]);
                                    }
                                }
                                this.state.staffDataHistory = fileData.staffDataHistory;
                            }
                            
                            // 导入配置记录
                            if (fileData.staffConfigs) {
                                for (let i = 0; i < fileData.staffConfigs.length; i++) {
                                    await DB.saveConfig(fileData.staffConfigs[i]);
                                }
                                this.state.staffConfigs = fileData.staffConfigs;
                            }

                            // 导入个性化需求配置记录
                            if (fileData.requestConfigs) {
                                for (let i = 0; i < fileData.requestConfigs.length; i++) {
                                    await DB.saveRequestConfig(fileData.requestConfigs[i]);
                                }
                                this.state.requestConfigs = fileData.requestConfigs;
                            }
                            
                            // 导入积分公式
                            if (fileData.scoreFormula) {
                                await DB.saveScoreFormula(fileData.scoreFormula);
                            }
                            
                            // 导入休息日规则配置
                            if (fileData.restDayRules) {
                                await DB.saveRestDayRules(fileData.restDayRules);
                            }
                            
                            console.log('状态已从本地文件 database/shiftscheduler.json 加载');
                            return true;
                        }
                    } catch (fileError) {
                        // 文件不存在或读取失败，忽略错误
                        console.log('本地文件不存在或读取失败，使用默认状态');
                    }
                }
            }
            
            return false;
        } catch (error) {
            console.error('加载状态失败:', error);
            return false;
        }
    },

    /**
     * 清空状态
     */
    async clearState() {
        this.state = {
            staffDataHistory: {},
            staffConfigs: [],
            activeConfigId: null,
            scheduleConfig: {
                startDate: null,
                endDate: null,
                year: null,
                month: null
            },
            constraints: [],
            personalRequests: {},
            requestConfigs: [],
            activeRequestConfigId: null,
            restDays: {},
            finalSchedule: null
        };
        // 清空 localStorage
        localStorage.removeItem('shiftSchedulerState');
        // 清空 IndexedDB
        if (typeof DB !== 'undefined' && DB.db) {
            try {
                await DB.clearAll();
            } catch (error) {
                console.error('清空IndexedDB失败:', error);
            }
        }
        console.log('状态已清空');
    },

    /**
     * 重置为初始状态（保留某些数据）
     * @param {Object} options - 重置选项
     */
    resetState(options = {}) {
        const preserved = {};
        if (options.preserveStaff) {
            preserved.staffDataHistory = this.state.staffDataHistory;
        }
        if (options.preserveConfig) {
            preserved.scheduleConfig = this.state.scheduleConfig;
        }
        if (options.preserveConstraints) {
            preserved.constraints = this.state.constraints;
        }
        if (options.preserveRequests) {
            preserved.personalRequests = this.state.personalRequests;
            preserved.requestConfigs = this.state.requestConfigs;
            preserved.activeRequestConfigId = this.state.activeRequestConfigId;
            preserved.restDays = this.state.restDays;
        }

        this.state = {
            staffDataHistory: preserved.staffDataHistory || {},
            staffConfigs: preserved.staffConfigs || [],
            activeConfigId: preserved.activeConfigId || null,
            scheduleConfig: preserved.scheduleConfig || {
                startDate: null,
                endDate: null,
                year: null,
                month: null
            },
            constraints: preserved.constraints || [],
            personalRequests: preserved.personalRequests || {},
            requestConfigs: preserved.requestConfigs || [],
            activeRequestConfigId: preserved.activeRequestConfigId || null,
            restDays: preserved.restDays || {},
            finalSchedule: null
        };
        this.saveState();
    }
};

// 页面加载时自动恢复状态
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', async () => {
        // 等待数据库初始化
        if (typeof DB !== 'undefined') {
            try {
                await DB.init();
            } catch (error) {
                console.error('数据库初始化失败:', error);
            }
        }
        // 加载状态
        await Store.loadState();
    });
}

// 导出 Store 对象（如果使用模块系统）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Store;
}

