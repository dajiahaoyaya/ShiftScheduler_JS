/**
 * 排班周期锁定管理模块
 * 负责管理排班周期的锁定状态和修改权限
 */

const ScheduleLockManager = {
    /**
     * 检查是否可以修改排班周期
     * @returns {Object} { canModify: boolean, reason: string, lockedPeriod: { year, month, startDate, endDate } | null }
     */
    checkCanModifySchedule() {
        // 优先检查是否有激活的排班周期配置
        const activeSchedulePeriodConfigId = Store.getState('activeSchedulePeriodConfigId');
        if (activeSchedulePeriodConfigId) {
            const activeSchedulePeriodConfig = Store.getSchedulePeriodConfig(activeSchedulePeriodConfigId);
            if (activeSchedulePeriodConfig && activeSchedulePeriodConfig.scheduleConfig) {
                const scheduleConfig = activeSchedulePeriodConfig.scheduleConfig;
                if (scheduleConfig.year && scheduleConfig.month) {
                    console.log('ScheduleLockManager.checkCanModifySchedule: 使用激活的排班周期配置:', scheduleConfig);
                    return {
                        canModify: false,
                        reason: '存在激活的排班周期配置',
                        lockedPeriod: {
                            year: scheduleConfig.year,
                            month: scheduleConfig.month,
                            startDate: scheduleConfig.startDate,
                            endDate: scheduleConfig.endDate
                        }
                    };
                }
            }
        }
        
        // 如果没有激活的排班周期配置，检查个性化休假配置和人员管理配置
        const requestConfigs = Store.getRequestConfigs() || [];
        const staffConfigs = Store.getStaffConfigs() || [];
        
        if (requestConfigs.length === 0 && staffConfigs.length === 0) {
            return { canModify: true, reason: '所有配置都为空', lockedPeriod: null };
        }
        
        // 检查个性化休假配置是否全部未激活
        const activeRequestConfigId = Store.getState('activeRequestConfigId');
        if (!activeRequestConfigId) {
            return { canModify: true, reason: '个性化休假配置全部未激活', lockedPeriod: null };
        }
        
        // 获取激活的个性化休假配置
        const activeRequestConfig = Store.getRequestConfig(activeRequestConfigId);
        if (!activeRequestConfig) {
            return { canModify: true, reason: '激活配置不存在', lockedPeriod: null };
        }
        
        // 获取激活配置的排班周期
        // 优先使用 scheduleConfig（包含 year 和 month），如果没有则尝试从 schedulePeriod 字符串解析
        let scheduleConfig = activeRequestConfig.scheduleConfig;
        
        // 如果 scheduleConfig 不存在或没有 year/month，尝试从 schedulePeriod 字符串解析
        if (!scheduleConfig || !scheduleConfig.year || !scheduleConfig.month) {
            const schedulePeriod = activeRequestConfig.schedulePeriod;
            if (schedulePeriod && typeof schedulePeriod === 'string') {
                // 尝试从字符串中解析年月（格式：YYYY-MM-DD 至 YYYY-MM-DD）
                // 或者从配置名称中解析（格式：YYYYMM-个性化休假-...）
                const nameMatch = activeRequestConfig.name.match(/^(\d{4})(\d{2})-/);
                if (nameMatch) {
                    scheduleConfig = {
                        year: parseInt(nameMatch[1]),
                        month: parseInt(nameMatch[2])
                    };
                } else {
                    // 尝试从 schedulePeriod 字符串中提取结束日期
                    const endDateMatch = schedulePeriod.match(/至\s*(\d{4})-(\d{2})-(\d{2})/);
                    if (endDateMatch) {
                        scheduleConfig = {
                            year: parseInt(endDateMatch[1]),
                            month: parseInt(endDateMatch[2])
                        };
                    }
                }
            }
        }
        
        // 如果仍然没有有效的排班周期，检查当前 Store 中的排班周期
        if (!scheduleConfig || !scheduleConfig.year || !scheduleConfig.month) {
            const currentScheduleConfig = Store.getState('scheduleConfig');
            if (currentScheduleConfig && currentScheduleConfig.year && currentScheduleConfig.month) {
                // 使用当前的排班周期作为锁定的排班周期
                console.log('ScheduleLockManager.checkCanModifySchedule: 使用当前排班周期作为锁定周期:', currentScheduleConfig);
                return {
                    canModify: false,
                    reason: '存在激活的个性化休假配置（使用当前排班周期）',
                    lockedPeriod: {
                        year: currentScheduleConfig.year,
                        month: currentScheduleConfig.month,
                        startDate: currentScheduleConfig.startDate,
                        endDate: currentScheduleConfig.endDate
                    }
                };
            }
            return { canModify: true, reason: '激活配置无排班周期', lockedPeriod: null };
        }
        
        // 返回锁定的排班周期
        console.log('ScheduleLockManager.checkCanModifySchedule: 使用配置中的排班周期:', scheduleConfig);
        return {
            canModify: false,
            reason: '存在激活的个性化休假配置',
            lockedPeriod: {
                year: scheduleConfig.year,
                month: scheduleConfig.month,
                startDate: scheduleConfig.startDate,
                endDate: scheduleConfig.endDate
            }
        };
    },
    
    /**
     * 检查当前页面是否允许修改排班周期
     * @param {string} currentView - 当前视图 'schedule' | 'staff' | 'request' | 'ruleConfig'
     * @param {string} currentSubView - 当前子视图 'configs' | 'staffList' | 'requestList' | null
     * @returns {boolean}
     */
    canModifyInCurrentView(currentView, currentSubView) {
        // 在个性化休假配置页面层级可以直接修改
        if (currentView === 'request' && currentSubView === 'configs') {
            return true;
        }
        
        // 在任何一个个性化需求录入页面可以修改
        if (currentView === 'request' && currentSubView === 'requestList') {
            return true;
        }
        
        return false;
    },
    
    /**
     * 更新排班周期控件的禁用状态
     */
    updateScheduleControlsState() {
        console.log('ScheduleLockManager.updateScheduleControlsState: 开始更新排班周期控件状态');
        
        const checkResult = this.checkCanModifySchedule();
        const currentView = Store.getState('currentView') || 'schedule';
        const currentSubView = Store.getState('currentSubView') || null;
        
        console.log('ScheduleLockManager.updateScheduleControlsState: checkResult:', checkResult);
        console.log('ScheduleLockManager.updateScheduleControlsState: currentView:', currentView, 'currentSubView:', currentSubView);
        
        // 检查是否有激活的排班周期配置
        const activeSchedulePeriodConfigId = Store.getState('activeSchedulePeriodConfigId');
        const hasActiveSchedulePeriod = !!activeSchedulePeriodConfigId;
        
        // 如果有激活的排班周期配置，直接锁定（不可修改）
        // 如果没有激活的排班周期配置，也锁定（显示为空）
        // 只有在排班周期管理页面且没有激活配置时，才允许修改
        let canModify = false;
        if (!hasActiveSchedulePeriod && (currentView === 'schedulePeriod' || currentView === 'schedule')) {
            // 没有激活的排班周期配置，且在排班周期管理页面，可以修改
            canModify = true;
        } else if (hasActiveSchedulePeriod) {
            // 有激活的排班周期配置，检查是否在允许的页面
            const canModifyInView = this.canModifyInCurrentView(currentView, currentSubView);
            canModify = canModifyInView;
        }
        
        console.log('ScheduleLockManager.updateScheduleControlsState: hasActiveSchedulePeriod:', hasActiveSchedulePeriod, 'canModify:', canModify);
        
        // 获取控件
        const yearInput = document.getElementById('scheduleYear');
        const monthInput = document.getElementById('scheduleMonth');
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        
        console.log('ScheduleLockManager.updateScheduleControlsState: 找到的控件:', {
            yearInput: !!yearInput,
            monthInput: !!monthInput,
            startDateInput: !!startDateInput,
            endDateInput: !!endDateInput
        });
        
        // 设置禁用状态和值
        if (hasActiveSchedulePeriod && checkResult.lockedPeriod) {
            // 有激活的排班周期配置，显示该配置的周期并置灰
            console.log('ScheduleLockManager.updateScheduleControlsState: 设置激活的排班周期配置:', checkResult.lockedPeriod);
            
            // 直接从激活配置获取值，确保实时更新
            const activeConfig = Store.getSchedulePeriodConfig(activeSchedulePeriodConfigId);
            const scheduleConfig = activeConfig && activeConfig.scheduleConfig ? activeConfig.scheduleConfig : null;
            
            const formatFn = typeof DateUtils !== 'undefined' ? DateUtils.formatDate.bind(DateUtils) : formatDate;
            
            if (yearInput) {
                yearInput.value = scheduleConfig ? scheduleConfig.year : (checkResult.lockedPeriod.year || '');
                yearInput.disabled = true;
                yearInput.classList.add('bg-gray-100', 'cursor-not-allowed', 'opacity-60');
                yearInput.classList.remove('bg-white');
            }
            if (monthInput) {
                monthInput.value = scheduleConfig ? scheduleConfig.month : (checkResult.lockedPeriod.month || '');
                monthInput.disabled = true;
                monthInput.classList.add('bg-gray-100', 'cursor-not-allowed', 'opacity-60');
                monthInput.classList.remove('bg-white');
            }
            if (startDateInput) {
                const startDate = scheduleConfig ? scheduleConfig.startDate : (checkResult.lockedPeriod.startDate || formatFn(
                    typeof DateCalculator !== 'undefined'
                        ? DateCalculator.calculateSchedulePeriod(checkResult.lockedPeriod.year, checkResult.lockedPeriod.month).startDate
                        : new Date(checkResult.lockedPeriod.year, checkResult.lockedPeriod.month - 2, 26)
                ));
                startDateInput.value = startDate;
                startDateInput.disabled = true;
                startDateInput.classList.add('bg-gray-100', 'cursor-not-allowed', 'opacity-60');
                startDateInput.classList.remove('bg-white');
            }
            if (endDateInput) {
                const endDate = scheduleConfig ? scheduleConfig.endDate : (checkResult.lockedPeriod.endDate || formatFn(
                    typeof DateCalculator !== 'undefined'
                        ? DateCalculator.calculateSchedulePeriod(checkResult.lockedPeriod.year, checkResult.lockedPeriod.month).endDate
                        : new Date(checkResult.lockedPeriod.year, checkResult.lockedPeriod.month - 1, 25)
                ));
                endDateInput.value = endDate;
                endDateInput.disabled = true;
                endDateInput.classList.add('bg-gray-100', 'cursor-not-allowed', 'opacity-60');
                endDateInput.classList.remove('bg-white');
            }
            
            // 更新状态
            if (scheduleConfig) {
                Store.updateState({
                    scheduleConfig: {
                        startDate: scheduleConfig.startDate,
                        endDate: scheduleConfig.endDate,
                        year: scheduleConfig.year,
                        month: scheduleConfig.month
                    }
                }, false); // 不自动保存，避免覆盖
            }
        } else if (!hasActiveSchedulePeriod) {
            // 没有激活的排班周期配置，显示为空并置灰
            console.log('ScheduleLockManager.updateScheduleControlsState: 没有激活的排班周期配置，清空并置灰');
            
            if (yearInput) {
                yearInput.value = '';
                yearInput.disabled = true;
                yearInput.classList.add('bg-gray-100', 'cursor-not-allowed', 'opacity-60');
                yearInput.classList.remove('bg-white');
            }
            if (monthInput) {
                monthInput.value = '';
                monthInput.disabled = true;
                monthInput.classList.add('bg-gray-100', 'cursor-not-allowed', 'opacity-60');
                monthInput.classList.remove('bg-white');
            }
            if (startDateInput) {
                startDateInput.value = '';
                startDateInput.disabled = true;
                startDateInput.classList.add('bg-gray-100', 'cursor-not-allowed', 'opacity-60');
                startDateInput.classList.remove('bg-white');
            }
            if (endDateInput) {
                endDateInput.value = '';
                endDateInput.disabled = true;
                endDateInput.classList.add('bg-gray-100', 'cursor-not-allowed', 'opacity-60');
                endDateInput.classList.remove('bg-white');
            }
        } else {
            // 其他情况，根据 canModify 设置
            if (yearInput) {
                yearInput.disabled = !canModify;
                if (!canModify) {
                    yearInput.classList.add('bg-gray-100', 'cursor-not-allowed', 'opacity-60');
                    yearInput.classList.remove('bg-white');
                } else {
                    yearInput.classList.remove('bg-gray-100', 'cursor-not-allowed', 'opacity-60');
                    yearInput.classList.add('bg-white');
                }
            }
            if (monthInput) {
                monthInput.disabled = !canModify;
                if (!canModify) {
                    monthInput.classList.add('bg-gray-100', 'cursor-not-allowed', 'opacity-60');
                    monthInput.classList.remove('bg-white');
                } else {
                    monthInput.classList.remove('bg-gray-100', 'cursor-not-allowed', 'opacity-60');
                    monthInput.classList.add('bg-white');
                }
            }
            if (startDateInput) {
                startDateInput.disabled = !canModify;
                if (!canModify) {
                    startDateInput.classList.add('bg-gray-100', 'cursor-not-allowed', 'opacity-60');
                    startDateInput.classList.remove('bg-white');
                } else {
                    startDateInput.classList.remove('bg-gray-100', 'cursor-not-allowed', 'opacity-60');
                    startDateInput.classList.add('bg-white');
                }
            }
            if (endDateInput) {
                endDateInput.disabled = !canModify;
                if (!canModify) {
                    endDateInput.classList.add('bg-gray-100', 'cursor-not-allowed', 'opacity-60');
                    endDateInput.classList.remove('bg-white');
                } else {
                    endDateInput.classList.remove('bg-gray-100', 'cursor-not-allowed', 'opacity-60');
                    endDateInput.classList.add('bg-white');
                }
            }
        }
        
        console.log('ScheduleLockManager.updateScheduleControlsState: 完成，canModify =', canModify);
        return { canModify, lockedPeriod: checkResult.lockedPeriod };
    },
    
    /**
     * 获取当前应该使用的排班周期（优先使用激活的排班周期配置，否则使用计算的）
     * @returns {Object} { year, month, startDate, endDate }
     */
    getCurrentSchedulePeriod() {
        // 优先检查是否有激活的排班周期配置
        const activeSchedulePeriodConfigId = Store.getState('activeSchedulePeriodConfigId');
        if (activeSchedulePeriodConfigId) {
            const activeSchedulePeriodConfig = Store.getSchedulePeriodConfig(activeSchedulePeriodConfigId);
            if (activeSchedulePeriodConfig && activeSchedulePeriodConfig.scheduleConfig) {
                const scheduleConfig = activeSchedulePeriodConfig.scheduleConfig;
                if (scheduleConfig.year && scheduleConfig.month) {
                    const formatFn = typeof DateUtils !== 'undefined' ? DateUtils.formatDate.bind(DateUtils) : formatDate;
                    return {
                        year: scheduleConfig.year,
                        month: scheduleConfig.month,
                        startDate: scheduleConfig.startDate || formatFn(
                            typeof DateCalculator !== 'undefined'
                                ? DateCalculator.calculateSchedulePeriod(scheduleConfig.year, scheduleConfig.month).startDate
                                : new Date(scheduleConfig.year, scheduleConfig.month - 2, 26)
                        ),
                        endDate: scheduleConfig.endDate || formatFn(
                            typeof DateCalculator !== 'undefined'
                                ? DateCalculator.calculateSchedulePeriod(scheduleConfig.year, scheduleConfig.month).endDate
                                : new Date(scheduleConfig.year, scheduleConfig.month - 1, 25)
                        )
                    };
                }
            }
        }
        
        // 如果没有激活的排班周期配置，检查是否有锁定的排班周期
        const checkResult = this.checkCanModifySchedule();
        if (checkResult.lockedPeriod) {
            const { year, month } = checkResult.lockedPeriod;
            const { startDate, endDate } = typeof DateCalculator !== 'undefined'
                ? DateCalculator.calculateSchedulePeriod(year, month)
                : (() => {
                    const start = new Date(year, month - 2, 26);
                    const end = new Date(year, month - 1, 25);
                    return { startDate: start, endDate: end };
                })();
            
            const formatFn = typeof DateUtils !== 'undefined' ? DateUtils.formatDate.bind(DateUtils) : formatDate;
            return {
                year,
                month,
                startDate: checkResult.lockedPeriod.startDate || formatFn(startDate),
                endDate: checkResult.lockedPeriod.endDate || formatFn(endDate)
            };
        }
        
        // 否则使用计算的排班周期
        const { year, month } = typeof DateCalculator !== 'undefined'
            ? DateCalculator.calculateTargetPeriod()
            : (() => {
                const today = new Date();
                const currentDay = today.getDate();
                let year = today.getFullYear();
                let month = today.getMonth() + 1;
                if (currentDay >= 1 && currentDay <= 25) {
                    month += 1;
                } else {
                    month += 2;
                }
                if (month > 12) {
                    year += Math.floor((month - 1) / 12);
                    month = ((month - 1) % 12) + 1;
                }
                return { year, month };
            })();
        
        const { startDate, endDate } = typeof DateCalculator !== 'undefined'
            ? DateCalculator.calculateSchedulePeriod(year, month)
            : (() => {
                const start = new Date(year, month - 2, 26);
                const end = new Date(year, month - 1, 25);
                return { startDate: start, endDate: end };
            })();
        
        const formatFn = typeof DateUtils !== 'undefined' ? DateUtils.formatDate.bind(DateUtils) : formatDate;
        return {
            year,
            month,
            startDate: formatFn(startDate),
            endDate: formatFn(endDate)
        };
    }
};

// 暴露到全局作用域
if (typeof window !== 'undefined') {
    window.ScheduleLockManager = ScheduleLockManager;
}

