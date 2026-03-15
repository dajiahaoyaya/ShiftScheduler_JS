/**
 * 状态管理模块 - 负责应用状态的管理和持久化
 */

// 休假类型常量
const VACATION_TYPES = {
    ANNUAL: 'ANNUAL',      // 指定休假（使用年假）- 蓝色标识
    LEGAL: 'LEGAL',        // 指定需求休假（不使用年假）- 绿色标识
    AUTO: 'REQ'            // 自动判断（兼容旧格式）- 灰色标识
};

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
        // 排班结果配置记录（多个配置快照）
        // 格式: [{ configId, name, scheduleResultSnapshot, scheduleConfig, schedulePeriod, createdAt, updatedAt }, ...]
        scheduleResultConfigs: [],
        // 当前激活的排班结果配置ID
        activeScheduleResultConfigId: null,
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
        currentConfigId: null,
        // 年假配额管理（可选，从员工数据中读取）
        // 格式: { "staffId": { total: X, used: Y, balance: Z } }
        annualLeaveQuotas: {},
        // 全量休息配置记录（多个配置快照）
        // 格式: [{ configId, name, schedulePeriodConfigId, fullRestSchedule, constraints, createdAt, updatedAt }, ...]
        fullRestConfigs: [],
        // 当前激活的全量休息配置ID
        activeFullRestConfigId: null,
        // 月度班次配置记录（多个配置快照）
        // 格式: [{ configId, name, monthlyShifts, schedulePeriod, createdAt, updatedAt }, ...]
        // monthlyShifts: { "staffId": "A1/A/A2/B1/B2", ... }
        monthlyShiftConfigs: [],
        // 当前激活的月度班次配置ID
        activeMonthlyShiftConfigId: null
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
     * 深拷贝对象（使用 structuredClone 或回退到 JSON 方法）
     * @param {*} obj - 要拷贝的对象
     * @returns {*} 深拷贝后的对象
     */
    deepClone(obj) {
        // 优先使用原生 structuredClone API（支持更多数据类型）
        if (typeof structuredClone !== 'undefined') {
            try {
                return structuredClone(obj);
            } catch (e) {
                // 如果 structuredClone 失败，回退到 JSON 方法
            }
        }
        // 回退到 JSON.parse(JSON.stringify())
        return JSON.parse(JSON.stringify(obj));
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
            const latest = history.reduce((currentLatest, record) => {
                if (!record.isValid) {
                    return currentLatest;
                }
                if (record.expiresAt && record.expiresAt < now) {
                    return currentLatest;
                }
                if (!currentLatest) {
                    return record;
                }
                return new Date(record.createdAt) > new Date(currentLatest.createdAt)
                    ? record
                    : currentLatest;
            }, null);
            
            if (latest) {
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
     * 获取指定人员的当前有效数据
     * @param {string} staffId - 人员ID
     * @returns {Object|null} 人员数据对象，如果不存在返回 null
     */
    getStaffData(staffId) {
        const allStaff = this.getCurrentStaffData();
        return allStaff.find(staff => (staff.staffId || staff.id) === staffId) || null;
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
     * 加载配置快照到当前工作状态
     * @param {string} configId - 配置ID
     */
    async setActiveConfig(configId) {
        const config = this.getStaffConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }

        // 确保只有一个激活：将当前激活的设置为非激活
        this.state.activeConfigId = configId;

        // 加载配置的人员数据快照到工作状态
        // 与 setActiveRequestConfig 和 setActiveSchedulePeriodConfig 保持一致
        if (config.staffDataSnapshot && Array.isArray(config.staffDataSnapshot)) {
            const now = new Date().toISOString();

            // 将快照中的每个人员数据作为新版本添加到 staffDataHistory
            config.staffDataSnapshot.forEach(staffData => {
                const staffId = staffData.id;
                if (!staffId) return;

                // 如果不存在，创建空数组
                if (!this.state.staffDataHistory[staffId]) {
                    this.state.staffDataHistory[staffId] = [];
                }

                // 使旧版本失效
                this.state.staffDataHistory[staffId].forEach(record => {
                    if (record.isValid && (!record.expiresAt || record.expiresAt > now)) {
                        record.isValid = false;
                    }
                });

                // 生成版本ID
                const versionId = `config_${configId}_${staffId}_${Date.now()}`;

                // 添加新记录（从快照恢复）
                const newRecord = {
                    data: { ...staffData },
                    createdAt: now,
                    expiresAt: null, // 激活的配置永不过期
                    isValid: true,
                    versionId: versionId,
                    sourceConfigId: configId // 记录来源配置
                };

                this.state.staffDataHistory[staffId].push(newRecord);
            });

            console.log(`setActiveConfig: 已加载配置 ${config.name} 的人员数据快照，包含 ${config.staffDataSnapshot.length} 个人员`);
        } else {
            console.warn(`setActiveConfig: 配置 ${config.name} 没有有效的人员数据快照`);
        }

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
     * @param {string} status - 休假类型：'ANNUAL'(年假), 'LEGAL'(法定休), 'REQ'(自动判断), ''(取消)
     */
    setPersonalRequest(staffId, date, status) {
        if (!this.state.personalRequests[staffId]) {
            this.state.personalRequests[staffId] = {};
        }

        // 支持多种休假类型：ANNUAL, LEGAL, REQ
        if (status && status !== '') {
            // 设置休假类型
            this.state.personalRequests[staffId][date] = status;
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
     * 获取激活的排班周期配置
     * @returns {Object|null} 配置对象
     */
    getActiveSchedulePeriodConfig() {
        if (!this.state.activeSchedulePeriodConfigId) {
            return null;
        }
        return this.getSchedulePeriodConfig(this.state.activeSchedulePeriodConfigId);
    },

    // ==================== 全量休息配置管理 ====================

    /**
     * 创建全量休息配置
     * @param {string} name - 配置名称
     * @param {string} schedulePeriodConfigId - 关联的排班周期配置ID
     * @param {Object} constraints - 约束参数
     * @returns {string} 配置ID
     */
    createFullRestConfig(name, schedulePeriodConfigId, constraints = {}) {
        const configId = 'frc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const config = {
            configId,
            name,
            schedulePeriodConfigId,
            constraints,
            fullRestSchedule: null,
            manpowerAnalysis: null,
            generatedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.state.fullRestConfigs.push(config);
        return configId;
    },

    /**
     * 更新全量休息配置
     * @param {string} configId - 配置ID
     * @param {Object} updates - 更新内容
     * @param {boolean} autoSave - 是否自动保存
     */
    updateFullRestConfig(configId, updates, autoSave = true) {
        const config = this.state.fullRestConfigs.find(c => c.configId === configId);
        if (!config) {
            throw new Error(`配置不存在: ${configId}`);
        }

        Object.assign(config, updates, { updatedAt: new Date().toISOString() });

        if (autoSave) {
            this.saveState();
        }
    },

    /**
     * 获取全量休息配置
     * @param {string} configId - 配置ID
     * @returns {Object|null} 配置对象
     */
    getFullRestConfig(configId) {
        return this.state.fullRestConfigs.find(c => c.configId === configId) || null;
    },

    /**
     * 获取所有全量休息配置
     * @returns {Array} 配置列表
     */
    getFullRestConfigs() {
        return this.state.fullRestConfigs || [];
    },

    /**
     * 删除全量休息配置
     * @param {string} configId - 配置ID
     */
    deleteFullRestConfig(configId) {
        const index = this.state.fullRestConfigs.findIndex(c => c.configId === configId);
        if (index !== -1) {
            // 如果删除的是激活的配置，清空激活状态
            if (this.state.activeFullRestConfigId === configId) {
                this.state.activeFullRestConfigId = null;
            }
            this.state.fullRestConfigs.splice(index, 1);
            this.saveState();
        }
    },

    /**
     * 设置激活的全量休息配置
     * @param {string} configId - 配置ID
     */
    async setActiveFullRestConfig(configId) {
        const config = this.getFullRestConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        this.state.activeFullRestConfigId = configId;
        await this.saveState();
    },

    /**
     * ==================== 月度班次配置管理 ====================
     */

    /**
     * 获取月度班次配置列表
     * @returns {Array} 配置列表
     */
    getMonthlyShiftConfigs() {
        return this.state.monthlyShiftConfigs || [];
    },

    /**
     * 获取指定月度班次配置
     * @param {string} configId - 配置ID
     * @returns {Object|null} 配置对象
     */
    getMonthlyShiftConfig(configId) {
        return (this.state.monthlyShiftConfigs || []).find(c => c.configId === configId) || null;
    },

    /**
     * 创建月度班次配置
     * @param {string} name - 配置名称
     * @param {Object} monthlyShifts - 月度班次分配 {staffId: shiftType, ...}
     * @param {string} schedulePeriod - 排班周期
     * @returns {string} 配置ID
     */
    createMonthlyShiftConfig(name, monthlyShifts, schedulePeriod) {
        const now = new Date();
        const configId = `monthly_shift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newConfig = {
            configId,
            name,
            monthlyShifts: JSON.parse(JSON.stringify(monthlyShifts || {})),
            schedulePeriod,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };
        this.state.monthlyShiftConfigs.push(newConfig);
        this.saveState();
        return configId;
    },

    /**
     * 更新月度班次配置
     * @param {string} configId - 配置ID
     * @param {Object} updates - 要更新的字段
     * @param {boolean} autoSave - 是否自动保存（默认不保存）
     */
    updateMonthlyShiftConfig(configId, updates, autoSave = false) {
        const config = this.getMonthlyShiftConfig(configId);
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
     * 删除月度班次配置
     * @param {string} configId - 配置ID
     */
    deleteMonthlyShiftConfig(configId) {
        const config = this.getMonthlyShiftConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        // 如果删除的是激活的配置，清空激活状态
        if (this.state.activeMonthlyShiftConfigId === configId) {
            this.state.activeMonthlyShiftConfigId = null;
        }
        this.state.monthlyShiftConfigs = (this.state.monthlyShiftConfigs || []).filter(c => c.configId !== configId);
        this.saveState();
    },

    /**
     * 设置激活的月度班次配置
     * @param {string} configId - 配置ID
     */
    async setActiveMonthlyShiftConfig(configId) {
        const config = this.getMonthlyShiftConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        this.state.activeMonthlyShiftConfigId = configId;
        await this.saveState();
    },

    /**
     * 获取激活的月度班次配置
     * @returns {Object|null} 配置对象
     */
    getActiveMonthlyShiftConfig() {
        if (!this.state.activeMonthlyShiftConfigId) {
            return null;
        }
        return this.getMonthlyShiftConfig(this.state.activeMonthlyShiftConfigId);
    },

    /**
     * 清除激活的月度班次配置
     */
    async clearActiveMonthlyShiftConfig() {
        this.state.activeMonthlyShiftConfigId = null;
        await this.saveState();
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
    },

    /**
     * 获取排班结果配置列表
     */
    getScheduleResultConfigs() {
        return this.state.scheduleResultConfigs || [];
    },

    /**
     * 获取指定排班结果配置
     */
    getScheduleResultConfig(configId) {
        return (this.state.scheduleResultConfigs || []).find(c => c.configId === configId) || null;
    },

    /**
     * 创建排班结果配置
     */
    createScheduleResultConfig(name, scheduleResult, scheduleConfig = null) {
        const now = new Date();
        const configId = `schedule_result_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newConfig = {
            configId,
            name,
            scheduleResultSnapshot: JSON.parse(JSON.stringify(scheduleResult || {})),
            scheduleConfig: scheduleConfig ? JSON.parse(JSON.stringify(scheduleConfig)) : null,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };
        this.state.scheduleResultConfigs.push(newConfig);
        this.saveState();
        return configId;
    },

    /**
     * 更新排班结果配置
     */
    updateScheduleResultConfig(configId, updates, autoSave = false) {
        const config = this.getScheduleResultConfig(configId);
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
     * 删除排班结果配置
     */
    deleteScheduleResultConfig(configId) {
        const config = this.getScheduleResultConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        if (this.state.activeScheduleResultConfigId === configId) {
            this.state.activeScheduleResultConfigId = null;
        }
        this.state.scheduleResultConfigs = (this.state.scheduleResultConfigs || []).filter(c => c.configId !== configId);
        this.saveState();
    },

    /**
     * 复制排班结果配置
     */
    duplicateScheduleResultConfig(configId, newName = null) {
        const source = this.getScheduleResultConfig(configId);
        if (!source) {
            throw new Error('配置记录不存在');
        }
        const now = new Date();
        const newConfigId = `schedule_result_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const copy = {
            configId: newConfigId,
            name: newName || `${source.name} (副本)`,
            scheduleResultSnapshot: JSON.parse(JSON.stringify(source.scheduleResultSnapshot || {})),
            scheduleConfig: source.scheduleConfig ? JSON.parse(JSON.stringify(source.scheduleConfig)) : null,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };
        this.state.scheduleResultConfigs.push(copy);
        this.saveState();
        return newConfigId;
    },

    /**
     * 设置激活排班结果配置
     */
    async setActiveScheduleResultConfig(configId) {
        const config = this.getScheduleResultConfig(configId);
        if (!config) {
            throw new Error('配置记录不存在');
        }
        this.state.activeScheduleResultConfigId = configId;
        this.state.finalSchedule = JSON.parse(JSON.stringify(config.scheduleResultSnapshot || {}));
        // 等待保存完成
        await this.saveState();
    },

    /**
     * ==================== 年假配额管理 ====================
     */

    /**
     * 计算员工的年假配额使用情况
     * @param {string} staffId - 员工ID
     * @returns {Object} { total: 总配额, used: 已使用, balance: 剩余 }
     */
    calculateAnnualLeaveQuota(staffId) {
        const staffData = this.getStaffData(staffId);
        if (!staffData) {
            console.warn(`calculateAnnualLeaveQuota: 员工 ${staffId} 不存在`);
            return { total: 0, used: 0, balance: 0 };
        }

        // 从员工数据中读取年假配额
        const total = staffData.annualLeaveDays || 0;

        // 统计已使用的年假（ANNUAL类型的休假）
        const personalRequests = this.state.personalRequests[staffId] || {};
        let used = 0;
        Object.values(personalRequests).forEach(status => {
            if (status === VACATION_TYPES.ANNUAL) {
                used++;
            }
        });

        const balance = Math.max(0, total - used);

        // 缓存到状态中
        this.state.annualLeaveQuotas[staffId] = { total, used, balance };

        return { total, used, balance };
    },

    /**
     * 计算员工的法定休息日配额使用情况
     * @param {string} staffId - 员工ID
     * @param {Object} schedulePeriod - 排班周期 { startDate, endDate }
     * @returns {Object} { total: 总配额, used: 已使用, balance: 剩余 }
     */
    calculateLegalRestQuota(staffId, schedulePeriod) {
        if (!schedulePeriod || !schedulePeriod.startDate || !schedulePeriod.endDate) {
            console.warn('calculateLegalRestQuota: 排班周期未设置');
            return { total: 0, used: 0, balance: 0 };
        }

        // 计算当月法定休息日天数
        const legalRestDaysCount = this.countLegalRestDaysInPeriod(schedulePeriod);

        // 统计已使用的法定休息日配额（LEGAL类型的休假）
        const personalRequests = this.state.personalRequests[staffId] || {};
        let used = 0;
        Object.entries(personalRequests).forEach(([date, status]) => {
            if (status === VACATION_TYPES.LEGAL) {
                // 检查日期是否在排班周期内
                if (date >= schedulePeriod.startDate && date <= schedulePeriod.endDate) {
                    used++;
                }
            }
        });

        const balance = Math.max(0, legalRestDaysCount - used);

        return { total: legalRestDaysCount, used, balance };
    },

    /**
     * 计算指定周期内的法定休息日天数
     * @param {Object} schedulePeriod - 排班周期 { startDate, endDate }
     * @returns {number} 法定休息日天数
     */
    countLegalRestDaysInPeriod(schedulePeriod) {
        if (!schedulePeriod || !schedulePeriod.startDate || !schedulePeriod.endDate) {
            return 0;
        }

        const { startDate, endDate } = schedulePeriod;
        const dateList = this.generateDateList(startDate, endDate);

        return dateList.filter(date => this.state.restDays[date] === true).length;
    },

    /**
     * 生成日期列表
     * @param {string} startDate - 开始日期 YYYY-MM-DD
     * @param {string} endDate - 结束日期 YYYY-MM-DD
     * @returns {Array<string>} 日期列表
     */
    generateDateList(startDate, endDate) {
        const dates = [];
        const current = new Date(startDate);
        const end = new Date(endDate);

        while (current <= end) {
            const year = current.getFullYear();
            const month = String(current.getMonth() + 1).padStart(2, '0');
            const day = String(current.getDate()).padStart(2, '0');
            dates.push(`${year}-${month}-${day}`);
            current.setDate(current.getDate() + 1);
        }

        return dates;
    },

    /**
     * 获取所有员工的年假配额统计
     * @returns {Object} { staffId: { total, used, balance } }
     */
    getAllAnnualLeaveQuotas() {
        const staffList = this.getCurrentStaffData();
        const quotas = {};

        staffList.forEach(staff => {
            quotas[staff.id] = this.calculateAnnualLeaveQuota(staff.id);
        });

        return quotas;
    },

    /**
     * 批量更新所有员工的年假配额缓存
     */
    refreshAllAnnualLeaveQuotas() {
        const staffList = this.getCurrentStaffData();

        staffList.forEach(staff => {
            this.calculateAnnualLeaveQuota(staff.id);
        });

        console.log('refreshAllAnnualLeaveQuotas: 已刷新所有员工的年假配额');
    },

    /**
     * ==================== 本月排班配置管理 ====================
     */

    /**
     * 获取本月排班配置列表
     * @returns {Array} 配置列表
     */
    getMonthlyScheduleConfigs() {
        return this.state.monthlyScheduleConfigs || [];
    },

    /**
     * 获取指定本月排班配置
     * @param {string} configId - 配置ID
     * @returns {Object|null} 配置对象
     */
    getMonthlyScheduleConfig(configId) {
        return (this.state.monthlyScheduleConfigs || []).find(c => c.configId === configId) || null;
    },

    /**
     * 创建本月排班配置
     * @param {string} name - 配置名称
     * @param {Object} staffScheduleData - 员工排班数据 {staffId: {staffId, staffName, shiftType, dailySchedule}, ...}
     * @returns {string} 配置ID
     */
    createMonthlyScheduleConfig(name, staffScheduleData) {
        const now = new Date();
        const configId = `monthly_schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newConfig = {
            configId,
            name,
            staffScheduleData: JSON.parse(JSON.stringify(staffScheduleData || {})),
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };
        if (!this.state.monthlyScheduleConfigs) {
            this.state.monthlyScheduleConfigs = [];
        }
        this.state.monthlyScheduleConfigs.push(newConfig);
        return configId;
    },

    /**
     * 更新本月排班配置
     * @param {string} configId - 配置ID
     * @param {Object} updates - 要更新的字段
     */
    updateMonthlyScheduleConfig(configId, updates) {
        const config = this.getMonthlyScheduleConfig(configId);
        if (config) {
            Object.assign(config, updates);
            config.updatedAt = new Date().toISOString();
        }
    },

    /**
     * 删除本月排班配置
     * @param {string} configId - 配置ID
     */
    deleteMonthlyScheduleConfig(configId) {
        this.state.monthlyScheduleConfigs = (this.state.monthlyScheduleConfigs || []).filter(c => c.configId !== configId);
    },

    /**
     * 设置激活的本月排班配置
     * @param {string} configId - 配置ID
     */
    async setActiveMonthlyScheduleConfig(configId) {
        this.state.activeMonthlyScheduleConfigId = configId;
        await this.saveState();
    },

    /**
     * 获取激活的本月排班配置ID
     * @returns {string|null} 配置ID
     */
    getActiveMonthlyScheduleConfigId() {
        return this.state.activeMonthlyScheduleConfigId || null;
    },

    /**
     * 获取激活的本月排班配置
     * @returns {Object|null} 配置对象
     */
    getActiveMonthlyScheduleConfig() {
        const configId = this.state.activeMonthlyScheduleConfigId;
        return configId ? this.getMonthlyScheduleConfig(configId) : null;
    },

    /**
     * ==================== 大夜配置管理 ====================
     */

    /**
     * 获取大夜配置列表
     * @returns {Array} 配置列表
     */
    getNightShiftConfigs() {
        return this.state.nightShiftConfigs || [];
    },

    /**
     * 获取指定大夜配置
     * @param {string} configId - 配置ID
     * @returns {Object|null} 配置对象
     */
    getNightShiftConfig(configId) {
        const configs = this.state.nightShiftConfigs || [];
        return configs.find(c => c.configId === configId) || null;
    },

    /**
     * 创建大夜配置
     * @param {string} name - 配置名称
     * @param {Object} nightShiftConfig - 大夜配置数据
     * @param {Object} scheduleConfig - 排班周期配置
     * @returns {string} 配置ID
     */
    createNightShiftConfig(name, nightShiftConfig, scheduleConfig) {
        const now = new Date();
        const configId = `night_shift_config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newConfig = {
            configId,
            name,
            nightShiftConfig: nightShiftConfig, // 大夜配置规则（regions、constraints等）
            scheduleConfig: scheduleConfig, // 排班周期配置（startDate、endDate、year、month）
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };

        // 添加到状态
        if (!this.state.nightShiftConfigs) {
            this.state.nightShiftConfigs = [];
        }
        this.state.nightShiftConfigs.push(newConfig);

        return configId;
    },

    /**
     * 设置激活的大夜配置
     * @param {string} configId - 配置ID
     */
    async setActiveNightShiftConfig(configId) {
        this.state.activeNightShiftConfigId = configId;
        await this.saveState();
    },

    /**
     * 获取激活的大夜配置ID
     * @returns {string|null} 配置ID
     */
    getActiveNightShiftConfigId() {
        return this.state.activeNightShiftConfigId || null;
    },

    /**
     * 获取激活的大夜配置
     * @returns {Object|null} 配置对象
     */
    getActiveNightShiftConfig() {
        const configId = this.state.activeNightShiftConfigId;
        return configId ? this.getNightShiftConfig(configId) : null;
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

