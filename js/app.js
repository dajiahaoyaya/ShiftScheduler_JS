/**
 * 主应用逻辑
 * 负责事件绑定和界面交互
 */

// 等待 DOM 加载完成
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 检查关键脚本是否加载（给脚本一些时间完成加载）
        // 对于大型脚本文件，可能需要一些时间解析和执行
        let retryCount = 0;
        const maxRetries = 10;
        while (typeof DailyManpowerManager === 'undefined' && retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 100));
            retryCount++;
        }
        
        const requiredModules = {
            'DailyManpowerManager': typeof DailyManpowerManager !== 'undefined',
            'Store': typeof Store !== 'undefined',
            'DB': typeof DB !== 'undefined'
        };
        
        const missingModules = Object.keys(requiredModules).filter(key => !requiredModules[key]);
        if (missingModules.length > 0) {
            console.warn('部分模块未加载:', missingModules);
            if (missingModules.includes('DailyManpowerManager')) {
                console.error('DailyManpowerManager 加载失败，请检查脚本文件是否有错误');
                
                // 检查 window 对象上是否存在
                console.error('诊断信息:', {
                    'typeof DailyManpowerManager': typeof DailyManpowerManager,
                    'typeof window.DailyManpowerManager': typeof window.DailyManpowerManager,
                    'window.DailyManpowerManager': window.DailyManpowerManager,
                    'dailyManpowerManagerLoaded': typeof window.dailyManpowerManagerLoaded !== 'undefined' ? window.dailyManpowerManagerLoaded : '未知',
                    'dailyManpowerManagerLoadError': typeof window.dailyManpowerManagerLoadError !== 'undefined' ? window.dailyManpowerManagerLoadError : '未知'
                });
                
                const scriptTag = document.getElementById('script-dailyManpowerManager');
                if (scriptTag) {
                    console.error('脚本标签信息:', {
                        src: scriptTag.src,
                        readyState: scriptTag.readyState,
                        onerror: scriptTag.onerror ? '已设置' : '未设置',
                        onload: scriptTag.onload ? '已设置' : '未设置'
                    });
                }
                
                // 尝试从 window 对象获取
                if (typeof window.DailyManpowerManager !== 'undefined') {
                    console.log('从 window 对象恢复 DailyManpowerManager');
                    // 注意：这里不能直接赋值给全局变量，但可以提示用户刷新
                }
            }
        }
        
        // 确保数据库初始化完成
        if (typeof DB !== 'undefined') {
            try {
                await DB.init();
                console.log('IndexedDB 初始化完成');
            } catch (error) {
                console.error('IndexedDB 初始化失败:', error);
            }
        }
        
        // 初始化界面
        initializeUI();
        
        // 绑定事件
        bindEvents();
        
        // 恢复状态并更新界面
        await restoreUIFromState();
        
        // 更新排班周期控件的禁用状态（在恢复状态后）
        if (typeof ScheduleLockManager !== 'undefined') {
            // 延迟一下确保DOM已完全加载
            setTimeout(() => {
                ScheduleLockManager.updateScheduleControlsState();
            }, 100);
        }
        
        // 排班配置当前阶段不涉及任何逻辑，不调用updateStaffDisplay
    } catch (error) {
        console.error('初始化失败:', error);
        // 安全地调用状态更新函数
        if (typeof StatusUtils !== 'undefined' && typeof StatusUtils.updateStatus === 'function') {
            StatusUtils.updateStatus('初始化失败：' + error.message, 'error');
        } else if (typeof updateStatus === 'function') {
            updateStatus('初始化失败：' + error.message, 'error');
        } else {
            console.error('初始化失败：' + error.message);
        }
    }
});

/**
 * 初始化界面
 */
function initializeUI() {
    // 使用 ScheduleLockManager 获取当前应该使用的排班周期
    // 优先使用锁定的排班周期（如果有激活的个性化休假配置），否则使用计算的排班周期
    const schedulePeriod = typeof ScheduleLockManager !== 'undefined'
        ? ScheduleLockManager.getCurrentSchedulePeriod()
        : (() => {
            // 后备方案：使用 DateCalculator 计算目标排班周期
            const { year: targetYear, month: targetMonth } = typeof DateCalculator !== 'undefined' 
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
                ? DateCalculator.calculateSchedulePeriod(targetYear, targetMonth)
                : (() => {
                    const start = new Date(targetYear, targetMonth - 2, 26);
                    const end = new Date(targetYear, targetMonth - 1, 25);
                    return { startDate: start, endDate: end };
                })();
            
            const formatFn = typeof DateUtils !== 'undefined' ? DateUtils.formatDate.bind(DateUtils) : formatDate;
            return {
                year: targetYear,
                month: targetMonth,
                startDate: formatFn(startDate),
                endDate: formatFn(endDate)
            };
        })();
    
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const yearInput = document.getElementById('scheduleYear');
    const monthInput = document.getElementById('scheduleMonth');
    
    // 设置年月选择器和日期输入框
    if (yearInput) {
        yearInput.value = schedulePeriod.year;
    }
    if (monthInput) {
        monthInput.value = schedulePeriod.month;
    }
    if (startDateInput) {
        startDateInput.value = schedulePeriod.startDate;
    }
    if (endDateInput) {
        endDateInput.value = schedulePeriod.endDate;
    }
    
    // 更新状态（但不自动保存，避免在页面初始化时覆盖激活状态）
    Store.updateState({
        scheduleConfig: {
            startDate: schedulePeriod.startDate,
            endDate: schedulePeriod.endDate,
            year: schedulePeriod.year,
            month: schedulePeriod.month
        }
    }, false); // 不自动保存，避免覆盖激活状态
    
    // 更新排班周期控件的禁用状态
    if (typeof ScheduleLockManager !== 'undefined') {
        ScheduleLockManager.updateScheduleControlsState();
    }
}

/**
 * 绑定事件
 */
function bindEvents() {
    try {
        // 页面切换按钮
        const btnSchedulePeriodView = document.getElementById('btnSchedulePeriodView');
        const btnScheduleView = document.getElementById('btnScheduleView');
        const btnStaffManageView = document.getElementById('btnStaffManageView');
        const btnRequestManageView = document.getElementById('btnRequestManageView');
        
        // 排班周期管理按钮
        if (btnSchedulePeriodView) {
            btnSchedulePeriodView.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    // 如果当前在其他子页面，先返回
                    if (typeof RequestManager !== 'undefined' && RequestManager.currentView === 'requestList') {
                        RequestManager.backToConfigList();
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    if (typeof StaffManager !== 'undefined' && StaffManager.currentView === 'staffList') {
                        StaffManager.showStaffManagement();
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    await showSchedulePeriodView();
                } catch (error) {
                    console.error('切换排班周期管理视图失败:', error);
                }
            });
        } else {
            console.warn('排班周期管理按钮未找到');
        }
        
        if (btnScheduleView) {
            btnScheduleView.addEventListener('click', (e) => {
                e.preventDefault();
                try {
                    // 如果当前在个性化需求的子页面，先返回配置列表
                    if (typeof RequestManager !== 'undefined' && RequestManager.currentView === 'requestList') {
                        RequestManager.backToConfigList();
                    }
                    // 如果当前在人员管理的子页面，先返回配置列表
                    if (typeof StaffManager !== 'undefined' && StaffManager.currentView === 'staffList') {
                        StaffManager.showStaffManagement();
                    }
                    showScheduleView();
                } catch (error) {
                    console.error('切换排班配置视图失败:', error);
                }
            });
        } else {
            console.warn('排班配置按钮未找到');
        }
        
        if (btnStaffManageView) {
            btnStaffManageView.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    // 检查前置条件：必须先激活排班周期配置
                    if (typeof FlowController !== 'undefined') {
                        const checkResult = FlowController.checkCanAccessStaffConfig();
                        if (!checkResult.canAccess) {
                            FlowController.showMessage(checkResult.message);
                            return;
                        }
                    }
                    
                    // 如果当前在个性化需求的子页面，先返回配置列表
                    if (typeof RequestManager !== 'undefined' && RequestManager.currentView === 'requestList') {
                        RequestManager.backToConfigList();
                    }
                    showStaffManageView();
                } catch (error) {
                    console.error('切换人员管理视图失败:', error);
                }
            });
        } else {
            console.warn('人员管理按钮未找到');
        }
        
        if (btnRequestManageView) {
            btnRequestManageView.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    // 检查前置条件：必须先激活人员管理配置
                    if (typeof FlowController !== 'undefined') {
                        const checkResult = FlowController.checkCanAccessRequestConfig();
                        if (!checkResult.canAccess) {
                            FlowController.showMessage(checkResult.message);
                            return;
                        }
                    }
                    
                    // 如果当前在个性化需求的子页面，先返回配置列表
                    if (typeof RequestManager !== 'undefined' && RequestManager.currentView === 'requestList') {
                        RequestManager.backToConfigList();
                        // 等待返回完成后再切换
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    // 如果当前在人员管理的子页面，先返回配置列表
                    if (typeof StaffManager !== 'undefined' && StaffManager.currentView === 'staffList') {
                        StaffManager.showStaffManagement();
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    await showRequestManageView();
                } catch (error) {
                    console.error('切换个性化休假视图失败:', error);
                }
            });
        } else {
            console.warn('个性化休假按钮未找到');
        }

        // 排班配置管理按钮
        const btnDailyManpowerView = document.getElementById('btnDailyManpowerView');
        if (btnDailyManpowerView) {
            btnDailyManpowerView.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    // 检查 DailyManpowerManager 是否已加载
                    if (typeof DailyManpowerManager === 'undefined') {
                        console.error('DailyManpowerManager 未定义，请检查脚本加载顺序');
                        console.error('脚本加载状态:', {
                            dailyManpowerManagerLoaded: typeof window.dailyManpowerManagerLoaded !== 'undefined' ? window.dailyManpowerManagerLoaded : '未知',
                            dailyManpowerManagerLoadError: typeof window.dailyManpowerManagerLoadError !== 'undefined' ? window.dailyManpowerManagerLoadError : '未知',
                            scriptElement: document.getElementById('script-dailyManpowerManager') ? '存在' : '不存在'
                        });
                        
                        // 安全地调用 alert 函数
                        if (typeof DialogUtils !== 'undefined' && typeof DialogUtils.alert === 'function') {
                            DialogUtils.alert('排班配置管理模块未加载，请刷新页面重试\n\n请检查浏览器控制台查看详细错误信息');
                        } else {
                            alert('排班配置管理模块未加载，请刷新页面重试\n\n请检查浏览器控制台查看详细错误信息');
                        }
                        return;
                    }
                    
                    // 如果当前在其他子页面，先返回
                    if (typeof RequestManager !== 'undefined' && RequestManager.currentView === 'requestList') {
                        RequestManager.backToConfigList();
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    if (typeof StaffManager !== 'undefined' && StaffManager.currentView === 'staffList') {
                        StaffManager.showStaffManagement();
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    
                    await showDailyManpowerView();
                } catch (error) {
                    console.error('切换排班配置管理视图失败:', error);
                    // 安全地调用状态更新函数
                    if (typeof StatusUtils !== 'undefined' && typeof StatusUtils.updateStatus === 'function') {
                        StatusUtils.updateStatus('切换排班配置管理失败：' + error.message, 'error');
                    } else if (typeof updateStatus === 'function') {
                        updateStatus('切换排班配置管理失败：' + error.message, 'error');
                    } else {
                        console.error('切换排班配置管理失败：' + error.message);
                    }
                }
            });
        } else {
            console.warn('排班配置管理按钮未找到');
        }

        // 排班规则配置按钮
        const btnRuleConfigView = document.getElementById('btnRuleConfigView');
        if (btnRuleConfigView) {
            console.log('排班规则配置按钮已找到，绑定事件监听器');
            btnRuleConfigView.addEventListener('click', async (e) => {
                e.preventDefault();
                console.log('排班规则配置按钮被点击');
                try {
                    // 检查前置条件：必须先激活人员管理配置和个性化休假配置
                    if (typeof FlowController !== 'undefined') {
                        const checkResult = FlowController.checkCanAccessRuleConfig();
                        if (!checkResult.canAccess) {
                            FlowController.showMessage(checkResult.message);
                            return;
                        }
                    }
                    
                    // 检查 RuleConfigManager 是否已加载
                    if (typeof RuleConfigManager === 'undefined') {
                        console.error('RuleConfigManager 未定义，请检查脚本加载顺序');
                        const alertFn = typeof DialogUtils !== 'undefined' ? DialogUtils.alert.bind(DialogUtils) : alert;
                        alertFn('排班规则配置模块未加载，请刷新页面重试');
                        return;
                    }
                    
                    // 如果当前在个性化需求的子页面，先返回配置列表
                    if (typeof RequestManager !== 'undefined' && RequestManager.currentView === 'requestList') {
                        RequestManager.backToConfigList();
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    // 如果当前在人员管理的子页面，先返回配置列表
                    if (typeof StaffManager !== 'undefined' && StaffManager.currentView === 'staffList') {
                        StaffManager.showStaffManagement();
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    console.log('准备调用 showRuleConfigView');
                    await showRuleConfigView();
                } catch (error) {
                    console.error('切换排班规则配置视图失败:', error);
                    console.error('错误堆栈:', error.stack);
                    const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
                    updateStatusFn('切换排班规则配置失败：' + error.message, 'error');
                    const alertFn = typeof DialogUtils !== 'undefined' ? DialogUtils.alert.bind(DialogUtils) : alert;
                    alertFn('切换排班规则配置失败：' + error.message + '\n\n请查看控制台获取详细信息');
                }
            });
        } else {
            console.warn('排班规则配置按钮未找到');
        }

        // 年月选择器事件
        const yearInput = document.getElementById('scheduleYear');
        const monthInput = document.getElementById('scheduleMonth');
        
        if (yearInput) {
            yearInput.addEventListener('change', handleYearMonthChange);
            yearInput.addEventListener('input', handleYearMonthChange); // 也监听input事件
        } else {
            console.warn('年份输入框未找到');
        }
        if (monthInput) {
            monthInput.addEventListener('change', handleYearMonthChange);
        } else {
            console.warn('月份选择框未找到');
        }

        // 日期配置事件（手动调整）
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        
        if (startDateInput) {
            startDateInput.addEventListener('change', handleDateChange);
        }
        if (endDateInput) {
            endDateInput.addEventListener('change', handleDateChange);
        }

        // 底部按钮事件
        const btnGenerate = document.getElementById('btnGenerate');
        const btnExport = document.getElementById('btnExport');
        const btnSaveAll = document.getElementById('btnSaveAll');

        if (btnGenerate) {
            btnGenerate.addEventListener('click', (e) => {
                e.preventDefault();
                try {
                    handleGenerateSchedule();
                } catch (error) {
                    console.error('生成排班失败:', error);
                    const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
                    updateStatusFn('生成排班失败：' + error.message, 'error');
                }
            });
        }
        if (btnExport) {
            btnExport.addEventListener('click', (e) => {
                e.preventDefault();
                try {
                    handleExportExcel();
                } catch (error) {
                    console.error('导出Excel失败:', error);
                    const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
                    updateStatusFn('导出Excel失败：' + error.message, 'error');
                }
            });
        }
        // 本地缓存导入浏览器按钮
        const btnImportFromFile = document.getElementById('btnImportFromFile');
        if (btnImportFromFile) {
            btnImportFromFile.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    await handleImportFromFile();
                } catch (error) {
                    console.error('导入本地缓存失败:', error);
                    const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
                    updateStatusFn('导入本地缓存失败：' + error.message, 'error');
                }
            });
        }
        
        // 浏览器导出至本地缓存按钮
        const btnExportToFile = document.getElementById('btnExportToFile');
        if (btnExportToFile) {
            btnExportToFile.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    await handleExportToFile();
                } catch (error) {
                    console.error('导出至本地缓存失败:', error);
                    const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
                    updateStatusFn('导出至本地缓存失败：' + error.message, 'error');
                }
            });
        }
        
        console.log('事件绑定完成');
    } catch (error) {
        console.error('绑定事件失败:', error);
        const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
        updateStatusFn('初始化事件绑定失败：' + error.message, 'error');
    }
}

/**
 * 处理年月变更（自动计算26-25号周期）
 */
async function handleYearMonthChange() {
    // 在函数开头声明一次，避免重复声明
    const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
    const formatFn = typeof DateUtils !== 'undefined' ? DateUtils.formatDate.bind(DateUtils) : formatDate;
    
    try {
        const yearInput = document.getElementById('scheduleYear');
        const monthInput = document.getElementById('scheduleMonth');
        
        if (!yearInput || !monthInput) {
            console.warn('年月输入框未找到');
            return;
        }
        
        const year = parseInt(yearInput.value);
        const month = parseInt(monthInput.value);
        
        if (!year || !month || isNaN(year) || isNaN(month) || month < 1 || month > 12) {
            console.warn('年月值无效:', { year, month });
            return;
        }
        
        // 计算开始日期：上个月的26号（例如：选择2026.01，则开始日期是2025.12.26）
        // 注意：month是1-12，Date构造函数中月份是0-11
        const startDate = new Date(year, month - 2, 26);
        // 计算结束日期：指定年月的25号（例如：选择2026.01，则结束日期是2026.01.25）
        const endDate = new Date(year, month - 1, 25);
        
        // 验证日期有效性
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            console.error('日期计算错误:', { year, month, startDate, endDate });
            updateStatusFn('日期计算错误，请检查年月设置', 'error');
            return;
        }
        
        const startDateStr = formatFn(startDate);
        const endDateStr = formatFn(endDate);
        
        // 更新日期输入框
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        if (startDateInput) startDateInput.value = startDateStr;
        if (endDateInput) endDateInput.value = endDateStr;
        
        // 检查是否可以修改排班周期
        const currentView = Store.getState('currentView') || 'schedule';
        const currentSubView = Store.getState('currentSubView') || null;
        let canModify = true;
        if (typeof ScheduleLockManager !== 'undefined') {
            const checkResult = ScheduleLockManager.checkCanModifySchedule();
            const canModifyInView = ScheduleLockManager.canModifyInCurrentView(currentView, currentSubView);
            // 正确的逻辑：如果 checkResult.canModify 是 false（有激活的配置），只有在允许的页面才能修改
            canModify = checkResult.canModify ? true : canModifyInView;
        }
        
        if (!canModify) {
            updateStatusFn('排班周期已锁定，无法修改', 'error');
            // 恢复为锁定的排班周期
            if (typeof ScheduleLockManager !== 'undefined') {
                ScheduleLockManager.updateScheduleControlsState();
            }
            return;
        }
        
        // 获取旧的排班周期（用于判断是否真的改变了）
        const oldScheduleConfig = Store.getState('scheduleConfig');
        const oldYear = oldScheduleConfig ? oldScheduleConfig.year : null;
        const oldMonth = oldScheduleConfig ? oldScheduleConfig.month : null;
        
        // 更新状态
        Store.updateState({
            scheduleConfig: {
                startDate: startDateStr,
                endDate: endDateStr,
                year: year,
                month: month
            }
        });
        
        // 检查是否在个性化休假配置管理或人员管理页面，且排班周期真的改变了
        const isScheduleChanged = oldYear !== year || oldMonth !== month;
        
        if (isScheduleChanged) {
            // 检查是否在个性化休假配置管理页面
            if (typeof RequestManager !== 'undefined' && RequestManager.currentView === 'requestList' && RequestManager.currentConfigId) {
                await updateRequestConfigNameOnScheduleChange(year, month);
            }
            // 检查是否在人员管理页面
            else if (typeof StaffManager !== 'undefined' && StaffManager.currentView === 'staffList' && StaffManager.currentConfigId) {
                await updateStaffConfigNameOnScheduleChange(year, month);
            }
        }
        
        // 更新排班周期控件的禁用状态
        if (typeof ScheduleLockManager !== 'undefined') {
            ScheduleLockManager.updateScheduleControlsState();
        }
        
        updateStatusFn('排班周期已更新', 'success');
        
        // 排班配置当前阶段不涉及任何逻辑，不调用updateStaffDisplay
    } catch (error) {
        console.error('处理年月变更失败:', error);
        // 使用函数开头已声明的 updateStatusFn
        updateStatusFn('更新排班周期失败：' + error.message, 'error');
    }
}

/**
 * 处理日期变更（手动调整）
 */
async function handleDateChange() {
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    
    const startDate = startDateInput ? startDateInput.value : null;
    const endDate = endDateInput ? endDateInput.value : null;
    
    if (startDate && endDate) {
        // 验证日期范围
        if (new Date(startDate) > new Date(endDate)) {
            const alertFn = typeof DialogUtils !== 'undefined' ? DialogUtils.alert.bind(DialogUtils) : alert;
            alertFn('开始日期不能晚于结束日期');
            return;
        }
        
        // 检查是否可以修改排班周期
        const currentView = Store.getState('currentView') || 'schedule';
        const currentSubView = Store.getState('currentSubView') || null;
        const canModify = typeof ScheduleLockManager !== 'undefined' 
            ? (ScheduleLockManager.checkCanModifySchedule().canModify || 
               ScheduleLockManager.canModifyInCurrentView(currentView, currentSubView))
            : true;
        
        if (!canModify) {
            const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
            updateStatusFn('排班周期已锁定，无法修改', 'error');
            // 恢复为锁定的排班周期
            if (typeof ScheduleLockManager !== 'undefined') {
                ScheduleLockManager.updateScheduleControlsState();
            }
            return;
        }
        
        // 获取旧的排班周期（用于判断是否真的改变了）
        const oldScheduleConfig = Store.getState('scheduleConfig');
        const oldStartDate = oldScheduleConfig ? oldScheduleConfig.startDate : null;
        const oldEndDate = oldScheduleConfig ? oldScheduleConfig.endDate : null;
        
        // 从结束日期计算年月（用于配置名称前缀）
        const endDateObj = new Date(endDate);
        const year = endDateObj.getFullYear();
        const month = endDateObj.getMonth() + 1;
        
        // 更新状态
        Store.updateState({
            scheduleConfig: {
                startDate: startDate,
                endDate: endDate,
                year: year,
                month: month
            }
        });
        
        // 更新排班周期控件的禁用状态
        if (typeof ScheduleLockManager !== 'undefined') {
            ScheduleLockManager.updateScheduleControlsState();
        }
        
        // 检查是否在个性化休假配置管理或人员管理页面，且排班周期真的改变了
        const isScheduleChanged = oldStartDate !== startDate || oldEndDate !== endDate;
        
        if (isScheduleChanged) {
            // 检查是否在个性化休假配置管理页面
            if (typeof RequestManager !== 'undefined' && RequestManager.currentView === 'requestList' && RequestManager.currentConfigId) {
                await updateRequestConfigNameOnScheduleChange(year, month);
            }
            // 检查是否在人员管理页面
            else if (typeof StaffManager !== 'undefined' && StaffManager.currentView === 'staffList' && StaffManager.currentConfigId) {
                await updateStaffConfigNameOnScheduleChange(year, month);
            }
        }
        
        const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
        updateStatusFn('日期配置已更新', 'success');
        
        // 排班配置当前阶段不涉及任何逻辑，不调用updateStaffDisplay
    }
}

/**
 * 处理生成排班
 */
async function handleGenerateSchedule() {
    const staffData = Store.getCurrentStaffData();
    const scheduleConfig = Store.getState('scheduleConfig');
    const personalRequests = Store.getAllPersonalRequests();
    const restDays = Store.getAllRestDays();
    
    if (!staffData || staffData.length === 0) {
        const alertFn = typeof DialogUtils !== 'undefined' ? DialogUtils.alert.bind(DialogUtils) : alert;
        alertFn('请先上传人员数据');
        return;
    }
    
    if (!scheduleConfig.startDate || !scheduleConfig.endDate) {
        const alertFn = typeof DialogUtils !== 'undefined' ? DialogUtils.alert.bind(DialogUtils) : alert;
        alertFn('请先配置日期范围');
        return;
    }
    
    const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
    updateStatusFn('正在生成排班...', 'info');
    
    try {
        // 获取排班顺序规则
        const schedulingOrder = typeof SchedulingRules !== 'undefined' ? 
            SchedulingRules.getSchedulingOrder() : 
            ['personalRequests', 'basicRestRules', 'nightShiftRules', 'dayShiftRules'];
        
        // 1. 满足个性化休假需求（优先保证）
        // 这一步已经在数据中体现，无需额外处理
        
        // 2. 满足基础休息需求规则
        // TODO: 实现基础休息需求规则校验
        
        // 3. 调用夜班排班算法
        if (typeof NightShiftSolver !== 'undefined') {
            const nightShiftRules = typeof NightShiftRules !== 'undefined' ? 
                NightShiftRules.getRules() : null;
            
            const nightShiftResult = await NightShiftSolver.generateNightShiftSchedule({
                staffData: staffData,
                scheduleConfig: scheduleConfig,
                personalRequests: personalRequests,
                restDays: restDays,
                rules: nightShiftRules
            });
            
            console.log('夜班排班结果:', nightShiftResult);
            
            // 保存夜班排班结果到 Store
            if (!Store.state.nightShiftSchedule) {
                Store.state.nightShiftSchedule = {};
            }
            Store.state.nightShiftSchedule = nightShiftResult.schedule;
            
            updateStatusFn(`夜班排班完成：共 ${nightShiftResult.stats.totalNightShifts} 个大夜班次`, 'success');
        } else {
            console.warn('夜班排班算法模块未加载');
            updateStatusFn('夜班排班算法模块未加载', 'error');
        }
        
        // 4. 调用白班排班算法
        // TODO: 实现白班排班算法
        
        // 5. 整合最终排班结果
        // TODO: 整合夜班和白班结果
        
        updateStatusFn('排班生成完成', 'success');
    } catch (error) {
        console.error('生成排班失败:', error);
        const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
        updateStatusFn('生成排班失败：' + error.message, 'error');
    }
}

/**
 * 处理导出 Excel
 */
function handleExportExcel() {
    const finalSchedule = Store.getState('finalSchedule');
    
    if (!finalSchedule) {
        alert('请先生成排班');
        return;
    }
    
    // TODO: 实现导出功能
    console.log('导出排班表...');
    alert('导出功能开发中...');
}

/**
 * 处理从本地文件导入到浏览器
 * 从 database/shiftscheduler.json 读取数据并导入到 IndexedDB
 */
async function handleImportFromFile() {
    try {
        const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
        updateStatusFn('正在同步本地缓存...', 'info');
        
        // 尝试从本地文件读取数据
        let fileData = null;
        try {
            const response = await fetch('database/shiftscheduler.json');
            if (!response.ok) {
                throw new Error(`HTTP错误: ${response.status}`);
            }
            fileData = await response.json();
            console.log('成功读取本地文件:', fileData);
        } catch (fetchError) {
            // 如果fetch失败，尝试使用文件选择器
            console.warn('无法直接读取本地文件，使用文件选择器:', fetchError);
            
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.json';
            fileInput.style.display = 'none';
            
            const filePromise = new Promise((resolve, reject) => {
                fileInput.addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (!file) {
                        document.body.removeChild(fileInput);
                        reject(new Error('未选择文件'));
                        return;
                    }
                    
                    try {
                        const text = await file.text();
                        const data = JSON.parse(text);
                        document.body.removeChild(fileInput);
                        resolve(data);
                    } catch (error) {
                        document.body.removeChild(fileInput);
                        reject(error);
                    }
                });
                
                fileInput.addEventListener('cancel', () => {
                    document.body.removeChild(fileInput);
                    reject(new Error('用户取消选择文件'));
                });
            });
            
            document.body.appendChild(fileInput);
            fileInput.click();
            
            fileData = await filePromise;
        }
        
        if (!fileData) {
            throw new Error('未读取到数据');
        }
        
        // 确保数据库已初始化
        if (typeof DB === 'undefined' || !DB.db) {
            await DB.init();
        }
        
        // 完全清空内存中的员工数据（在导入前清空）
        Store.state.staffDataHistory = {};
        
        // 导入数据到 IndexedDB
        await DB.importFromFile(fileData);
        
        // 重新加载状态到 Store
        await Store.loadState();
        
        // 恢复界面状态
        await restoreUIFromState();
        
        // 根据当前视图刷新显示
        const btnScheduleView = document.getElementById('btnScheduleView');
        const btnStaffManageView = document.getElementById('btnStaffManageView');
        const btnRequestManageView = document.getElementById('btnRequestManageView');
        
        // 检查哪个按钮是激活的
        if (btnStaffManageView && btnStaffManageView.classList.contains('bg-purple-600')) {
            // 如果在人员管理视图，刷新人员列表
            if (typeof StaffManager !== 'undefined' && StaffManager.showStaffManagement) {
                StaffManager.showStaffManagement();
            }
        } else if (btnRequestManageView && btnRequestManageView.classList.contains('bg-purple-600')) {
            // 如果在个性化休假视图，刷新需求列表
            if (typeof RequestManager !== 'undefined' && RequestManager.showRequestManagement) {
                await RequestManager.showRequestManagement();
            }
        } else {
            // 默认在排班配置视图，不做任何操作（排班配置当前阶段不涉及任何逻辑）
        }
        
        // 使用已声明的 updateStatusFn
        updateStatusFn('本地缓存已导入到浏览器', 'success');
        
        // 统计导入的数据量
        const stats = {
            staffConfigs: fileData.staffConfigs ? fileData.staffConfigs.length : 0,
            requestConfigs: fileData.requestConfigs ? fileData.requestConfigs.length : 0,
            staffHistory: fileData.staffDataHistory ? Object.keys(fileData.staffDataHistory).length : 0
        };
        
        alert(`本地缓存已成功导入到浏览器！\n\n导入数据统计：\n- 人员配置：${stats.staffConfigs} 个\n- 需求配置：${stats.requestConfigs} 个\n- 人员历史记录：${stats.staffHistory} 条\n\n界面已自动刷新。`);
        
    } catch (error) {
        console.error('导入本地缓存失败:', error);
        
        // 在 catch 块开头声明一次，避免重复声明
        const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
        
        if (error.message === '用户取消选择文件') {
            updateStatusFn('已取消导入', 'info');
            return;
        }
        
        updateStatusFn('导入本地缓存失败：' + error.message, 'error');
        
        // 提供更详细的错误信息
        let errorMessage = '导入本地缓存失败：' + error.message;
        if (error.message.includes('HTTP错误: 404')) {
            errorMessage += '\n\n提示：请确保 database/shiftscheduler.json 文件存在。\n如果文件不存在，请先使用"浏览器导出至本地缓存"功能创建文件。';
        } else if (error.message.includes('Failed to fetch')) {
            errorMessage += '\n\n提示：无法直接读取本地文件（可能是CORS限制）。\n请使用文件选择器选择 shiftscheduler.json 文件。';
        }
        
        alert(errorMessage);
    }
}

/**
 * 处理从浏览器导出到本地缓存文件
 * 将 IndexedDB 中的数据导出为 JSON 文件
 */
async function handleExportToFile() {
    // 在函数开头声明一次，避免重复声明
    const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
    
    try {
        updateStatusFn('正在导出至本地缓存...', 'info');
        
        // 先保存到浏览器（确保数据最新）
        await Store.saveState(false);
        
        // 然后导出到文件
        if (typeof DB !== 'undefined' && DB.db) {
            await DB.exportToFile();
        } else {
            throw new Error('数据库未初始化');
        }
        
        updateStatusFn('已导出至本地缓存', 'success');
        alert('数据已成功导出至本地缓存！\n\n文件已下载，请将 shiftscheduler.json 文件保存到项目的 database/ 目录中。');
    } catch (error) {
        console.error('导出至本地缓存失败:', error);
        // 使用函数开头已声明的 updateStatusFn
        updateStatusFn('导出至本地缓存失败：' + error.message, 'error');
        alert('导出至本地缓存失败：' + error.message);
    }
}

/**
 * 从状态恢复界面
 */
async function restoreUIFromState() {
    try {
        // 先从IndexedDB加载状态
        if (typeof Store !== 'undefined' && Store.loadState) {
            await Store.loadState();
        }
        
        // 检查是否有锁定的排班周期（优先使用锁定的，否则使用保存的）
        let scheduleConfig = Store.getState('scheduleConfig');
        
        // 如果有锁定的排班周期，使用锁定的（不恢复保存的值）
        if (typeof ScheduleLockManager !== 'undefined') {
            const currentPeriod = ScheduleLockManager.getCurrentSchedulePeriod();
            scheduleConfig = {
                startDate: currentPeriod.startDate,
                endDate: currentPeriod.endDate,
                year: currentPeriod.year,
                month: currentPeriod.month
            };
            // 更新Store中的排班周期
            Store.updateState({
                scheduleConfig: scheduleConfig
            }, false); // 不自动保存
        }
        
        // 恢复日期配置
        if (scheduleConfig && scheduleConfig.startDate) {
            const startDateInput = document.getElementById('startDate');
            if (startDateInput) {
                startDateInput.value = scheduleConfig.startDate;
            }
        }
        
        if (scheduleConfig && scheduleConfig.endDate) {
            const endDateInput = document.getElementById('endDate');
            if (endDateInput) {
                endDateInput.value = scheduleConfig.endDate;
            }
        }
        
        // 恢复年月选择器
        if (scheduleConfig && scheduleConfig.year && scheduleConfig.month) {
            const yearInput = document.getElementById('scheduleYear');
            const monthInput = document.getElementById('scheduleMonth');
            if (yearInput) yearInput.value = scheduleConfig.year;
            if (monthInput) monthInput.value = scheduleConfig.month;
        }
        
        // 恢复激活状态（但不恢复视图状态，刷新后总是回到排班展示页面）
        const activeConfigId = Store.getState('activeConfigId');
        const activeRequestConfigId = Store.getState('activeRequestConfigId');
        
        console.log('恢复激活状态:', { activeConfigId, activeRequestConfigId });
        
        // 确保激活状态正确设置到Manager对象中
        if (typeof StaffManager !== 'undefined' && activeConfigId) {
            // 确保激活的配置存在
            const activeConfig = Store.getStaffConfig(activeConfigId);
            if (activeConfig) {
                console.log('恢复人员配置激活状态:', activeConfigId);
            } else {
                console.warn('激活的人员配置不存在:', activeConfigId);
            }
        }
        
        if (typeof RequestManager !== 'undefined' && activeRequestConfigId) {
            // 确保激活的配置存在
            const activeConfig = Store.getRequestConfig(activeRequestConfigId);
            if (activeConfig) {
                console.log('恢复个性化休假配置激活状态:', activeRequestConfigId);
            } else {
                console.warn('激活的个性化休假配置不存在:', activeRequestConfigId);
            }
        }
        
        // 刷新后总是显示排班展示页面（不恢复之前的视图状态）
        showScheduleView();
        
        // 排班配置当前阶段不涉及任何逻辑，不调用updateStaffDisplay
    } catch (error) {
        console.error('恢复界面状态失败:', error);
        // 即使恢复失败，也显示默认视图
        showScheduleView();
    }
}

/**
 * 显示排班周期管理视图
 */
async function showSchedulePeriodView() {
    if (typeof SchedulePeriodManager !== 'undefined' && SchedulePeriodManager.showSchedulePeriodManagement) {
        await SchedulePeriodManager.showSchedulePeriodManagement();

        // 更新侧边栏按钮状态
        const btnSchedulePeriodView = document.getElementById('btnSchedulePeriodView');
        const btnScheduleView = document.getElementById('btnScheduleView');
        const btnStaffManageView = document.getElementById('btnStaffManageView');
        const btnRequestManageView = document.getElementById('btnRequestManageView');
        const btnRuleConfigView = document.getElementById('btnRuleConfigView');

        if (btnSchedulePeriodView) {
            btnSchedulePeriodView.classList.remove('bg-gray-400');
            btnSchedulePeriodView.classList.add('bg-blue-600');
        }
        if (btnScheduleView) {
            btnScheduleView.classList.remove('bg-blue-600');
            btnScheduleView.classList.add('bg-gray-400');
        }
        if (btnStaffManageView) {
            btnStaffManageView.classList.remove('bg-purple-600');
            btnStaffManageView.classList.add('bg-gray-400');
        }
        if (btnRequestManageView) {
            btnRequestManageView.classList.remove('bg-purple-600');
            btnRequestManageView.classList.add('bg-gray-400');
        }
        if (btnRuleConfigView) {
            btnRuleConfigView.classList.remove('bg-orange-600');
            btnRuleConfigView.classList.add('bg-gray-400');
        }

        const mainTitle = document.getElementById('mainTitle');
        if (mainTitle) {
            mainTitle.textContent = '排班周期管理';
        }

        // 更新排班周期控件的禁用状态
        if (typeof ScheduleLockManager !== 'undefined') {
            ScheduleLockManager.updateScheduleControlsState();
        }
    } else {
        console.error('SchedulePeriodManager 未加载');
        alert('排班周期管理模块未加载，请刷新页面重试');
    }
}

/**
 * 显示排班配置视图
 */
function showScheduleView() {
    // 使用 ViewManager 显示视图
    if (typeof ViewManager !== 'undefined' && ViewManager.showScheduleView) {
        ViewManager.showScheduleView();
    } else {
        // 后备方案：如果ViewManager未加载，使用原有逻辑
        const mainTitle = document.getElementById('mainTitle');
        if (mainTitle) {
            mainTitle.textContent = '排班配置';
        }
        
        // 更新侧边栏按钮状态
        const btnScheduleView = document.getElementById('btnScheduleView');
        const btnStaffManageView = document.getElementById('btnStaffManageView');
        const btnRequestManageView = document.getElementById('btnRequestManageView');
        if (btnScheduleView) {
            btnScheduleView.classList.remove('bg-gray-400');
            btnScheduleView.classList.add('bg-blue-600');
        }
        if (btnStaffManageView) {
            btnStaffManageView.classList.remove('bg-purple-600');
            btnStaffManageView.classList.add('bg-gray-400');
        }
        if (btnRequestManageView) {
            btnRequestManageView.classList.remove('bg-purple-600');
            btnRequestManageView.classList.add('bg-gray-400');
        }

        // 更新当前视图状态（但不自动保存，避免覆盖激活状态）
        Store.updateState({
            currentView: 'schedule',
            currentSubView: null,
            currentConfigId: null
        }, false); // 不自动保存，避免覆盖激活状态

        // 更新排班周期控件的禁用状态
        if (typeof ScheduleLockManager !== 'undefined') {
            ScheduleLockManager.updateScheduleControlsState();
        }

        // 排班配置页面保持空白占位（当前阶段不涉及任何逻辑）
        const scheduleTable = document.getElementById('scheduleTable');
        if (scheduleTable) {
            scheduleTable.innerHTML = `
                <div class="p-8 text-center text-gray-400">
                    <p>排班配置功能待实现</p>
                </div>
            `;
        }
    }
}

/**
 * 显示人员管理视图
 */
function showStaffManageView() {
    // 使用 ViewManager 显示视图
    if (typeof ViewManager !== 'undefined' && ViewManager.showStaffManageView) {
        ViewManager.showStaffManageView();
    } else {
        // 后备方案：如果ViewManager未加载，使用原有逻辑
        // 在函数开头声明一次，避免重复声明
        const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
        
        try {
            console.log('切换到人员管理视图');
            
            const mainTitle = document.getElementById('mainTitle');
            if (mainTitle) {
                mainTitle.textContent = '人员管理';
            }
            
            // 更新侧边栏按钮状态
            const btnScheduleView = document.getElementById('btnScheduleView');
            const btnStaffManageView = document.getElementById('btnStaffManageView');
            const btnRequestManageView = document.getElementById('btnRequestManageView');
            if (btnScheduleView) {
                btnScheduleView.classList.remove('bg-blue-600');
                btnScheduleView.classList.add('bg-gray-400');
            }
            if (btnStaffManageView) {
                btnStaffManageView.classList.remove('bg-gray-400');
                btnStaffManageView.classList.add('bg-purple-600');
            }
            if (btnRequestManageView) {
                btnRequestManageView.classList.remove('bg-purple-600');
                btnRequestManageView.classList.add('bg-gray-400');
            }
            
            // 检查StaffManager是否存在
            if (typeof StaffManager === 'undefined') {
                console.error('StaffManager未定义，请检查脚本加载顺序');
                updateStatusFn('人员管理模块未加载', 'error');
                alert('人员管理模块未加载，请刷新页面重试');
                return;
            }
            
            // 检查showStaffManagement方法是否存在
            if (typeof StaffManager.showStaffManagement !== 'function') {
                console.error('StaffManager.showStaffManagement方法不存在');
                updateStatusFn('人员管理方法不存在', 'error');
                alert('人员管理方法不存在，请检查代码');
                return;
            }
            
            console.log('调用StaffManager.showStaffManagement()');
            StaffManager.showStaffManagement();
            
            // 更新当前视图状态（但不自动保存，避免覆盖激活状态）
            Store.updateState({
                currentView: 'staff',
                currentSubView: StaffManager.currentView || 'configs',
                currentConfigId: null
            }, false); // 不自动保存，避免覆盖激活状态
            
            console.log('人员管理视图切换完成');
            updateStatusFn('已切换到人员管理', 'success');
        } catch (error) {
            console.error('切换人员管理视图失败:', error);
            updateStatusFn('切换人员管理失败：' + error.message, 'error');
            alert('切换人员管理失败：' + error.message + '\n\n请查看控制台获取详细信息');
        }
    }
}

/**
 * 显示排班规则配置视图
 */
/**
 * 显示排班配置管理视图
 */
async function showDailyManpowerView() {
    try {
        // 调用排班配置管理器显示配置
        if (typeof DailyManpowerManager !== 'undefined') {
            await DailyManpowerManager.showDailyManpowerConfig();
        } else {
            throw new Error('DailyManpowerManager 未加载');
        }
        
        // 更新视图状态
        if (typeof Store !== 'undefined') {
            Store.updateState({
                currentView: 'dailyManpower',
                currentSubView: null,
                currentConfigId: null
            }, false);
        }
        
        // 更新侧边栏按钮状态
        const btnSchedulePeriodView = document.getElementById('btnSchedulePeriodView');
        const btnScheduleView = document.getElementById('btnScheduleView');
        const btnStaffManageView = document.getElementById('btnStaffManageView');
        const btnRequestManageView = document.getElementById('btnRequestManageView');
        const btnRuleConfigView = document.getElementById('btnRuleConfigView');
        const btnDailyManpowerView = document.getElementById('btnDailyManpowerView');
        
        if (btnSchedulePeriodView) {
            btnSchedulePeriodView.classList.remove('bg-blue-600');
            btnSchedulePeriodView.classList.add('bg-gray-400');
        }
        if (btnScheduleView) {
            btnScheduleView.classList.remove('bg-blue-600');
            btnScheduleView.classList.add('bg-gray-400');
        }
        if (btnStaffManageView) {
            btnStaffManageView.classList.remove('bg-purple-600');
            btnStaffManageView.classList.add('bg-gray-400');
        }
        if (btnRequestManageView) {
            btnRequestManageView.classList.remove('bg-purple-600');
            btnRequestManageView.classList.add('bg-gray-400');
        }
        if (btnRuleConfigView) {
            btnRuleConfigView.classList.remove('bg-orange-600');
            btnRuleConfigView.classList.add('bg-gray-400');
        }
        if (btnDailyManpowerView) {
            btnDailyManpowerView.classList.remove('bg-gray-400');
            btnDailyManpowerView.classList.add('bg-indigo-600');
        }
        
        // 更新主标题
        const mainTitle = document.getElementById('mainTitle');
        if (mainTitle) {
            mainTitle.textContent = '排班配置管理';
        }
        
        // 更新排班周期控件的禁用状态（排班配置管理页面允许修改排班周期）
        if (typeof ScheduleLockManager !== 'undefined') {
            ScheduleLockManager.updateScheduleControlsState();
        }
    } catch (error) {
        console.error('显示排班配置管理视图失败:', error);
        const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
        updateStatusFn('显示排班配置管理失败：' + error.message, 'error');
        throw error;
    }
}

async function showRuleConfigView() {
    console.log('showRuleConfigView 被调用');
    console.log('RuleConfigManager 是否存在:', typeof RuleConfigManager !== 'undefined');
    console.log('RuleConfigManager.showRuleConfig 是否存在:', typeof RuleConfigManager !== 'undefined' && typeof RuleConfigManager.showRuleConfig === 'function');
    
    // 使用 RuleConfigManager 显示视图
    if (typeof RuleConfigManager !== 'undefined' && RuleConfigManager.showRuleConfig) {
        try {
            console.log('调用 RuleConfigManager.showRuleConfig()');
            await RuleConfigManager.showRuleConfig();
            console.log('RuleConfigManager.showRuleConfig() 执行完成');
            
            // 更新视图状态
            Store.updateState({
                currentView: 'ruleConfig',
                currentSubView: null,
                currentConfigId: null
            }, false); // 不自动保存
            
            // 更新排班周期控件的禁用状态（排班规则配置页面不允许修改排班周期）
            if (typeof ScheduleLockManager !== 'undefined') {
                ScheduleLockManager.updateScheduleControlsState();
            }
            
            // 更新侧边栏按钮状态
            const btnScheduleView = document.getElementById('btnScheduleView');
            const btnStaffManageView = document.getElementById('btnStaffManageView');
            const btnRequestManageView = document.getElementById('btnRequestManageView');
            const btnRuleConfigView = document.getElementById('btnRuleConfigView');
            
            if (btnScheduleView) {
                btnScheduleView.classList.remove('bg-blue-600');
                btnScheduleView.classList.add('bg-gray-400');
            }
            if (btnStaffManageView) {
                btnStaffManageView.classList.remove('bg-purple-600');
                btnStaffManageView.classList.add('bg-gray-400');
            }
            if (btnRequestManageView) {
                btnRequestManageView.classList.remove('bg-purple-600');
                btnRequestManageView.classList.add('bg-gray-400');
            }
            if (btnRuleConfigView) {
                btnRuleConfigView.classList.remove('bg-gray-400');
                btnRuleConfigView.classList.add('bg-orange-600');
            }
            
            // 更新主标题
            const mainTitle = document.getElementById('mainTitle');
            if (mainTitle) {
                mainTitle.textContent = '排班规则配置';
            }
            
            console.log('排班规则配置视图切换完成');
        } catch (error) {
            console.error('RuleConfigManager.showRuleConfig() 执行失败:', error);
            console.error('错误堆栈:', error.stack);
            const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
            updateStatusFn('排班规则配置加载失败：' + error.message, 'error');
            const alertFn = typeof DialogUtils !== 'undefined' ? DialogUtils.alert.bind(DialogUtils) : alert;
            alertFn('排班规则配置加载失败：' + error.message + '\n\n请查看控制台获取详细信息');
        }
    } else {
        // 后备方案：如果RuleConfigManager未加载，显示错误提示
        console.error('RuleConfigManager 未加载或 showRuleConfig 方法不存在');
        const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
        updateStatusFn('排班规则配置模块未加载', 'error');
        const alertFn = typeof DialogUtils !== 'undefined' ? DialogUtils.alert.bind(DialogUtils) : alert;
        alertFn('排班规则配置模块未加载，请刷新页面重试\n\n请检查浏览器控制台查看详细错误信息');
    }
}

/**
 * 显示个性化休假视图
 */
async function showRequestManageView() {
    // 使用 ViewManager 显示视图
    if (typeof ViewManager !== 'undefined' && ViewManager.showRequestManageView) {
        await ViewManager.showRequestManageView();
    } else {
        // 后备方案：如果ViewManager未加载，使用原有逻辑
        const mainTitle = document.getElementById('mainTitle');
        if (mainTitle) {
            mainTitle.textContent = '个性化休假';
        }
        
        // 更新侧边栏按钮状态
        const btnScheduleView = document.getElementById('btnScheduleView');
        const btnStaffManageView = document.getElementById('btnStaffManageView');
        const btnRequestManageView = document.getElementById('btnRequestManageView');
        if (btnScheduleView) {
            btnScheduleView.classList.remove('bg-blue-600');
            btnScheduleView.classList.add('bg-gray-400');
        }
        if (btnStaffManageView) {
            btnStaffManageView.classList.remove('bg-purple-600');
            btnStaffManageView.classList.add('bg-gray-400');
        }
        if (btnRequestManageView) {
            btnRequestManageView.classList.remove('bg-gray-400');
            btnRequestManageView.classList.add('bg-purple-600');
        }
        
        // 检查 RequestManager 是否已加载
        console.log('showRequestManageView: 开始检查 RequestManager');
        console.log('showRequestManageView: 当前 RequestManager 状态:', {
            'typeof RequestManager': typeof RequestManager,
            'typeof window.RequestManager': typeof window !== 'undefined' ? typeof window.RequestManager : 'window未定义',
            'window.RequestManager存在': typeof window !== 'undefined' && typeof window.RequestManager !== 'undefined'
        });
        
        let retryCount = 0;
        const maxRetries = 30; // 增加重试次数到30次（总共3秒）
        let RequestManagerRef = undefined;
        
        // 先尝试立即获取
        RequestManagerRef = typeof RequestManager !== 'undefined' ? RequestManager : (typeof window !== 'undefined' && window.RequestManager ? window.RequestManager : undefined);
        
        // 如果未找到，等待并重试
        while (!RequestManagerRef && retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 100));
            retryCount++;
            RequestManagerRef = typeof RequestManager !== 'undefined' ? RequestManager : (typeof window !== 'undefined' && window.RequestManager ? window.RequestManager : undefined);
            if (RequestManagerRef) {
                console.log(`showRequestManageView: RequestManager 在第 ${retryCount} 次重试后找到`);
                break;
            }
        }
        
        if (!RequestManagerRef) {
            console.error('RequestManager 未加载，请检查脚本文件 js/vacationManager.js 是否正确加载');
            console.error('showRequestManageView: 检查了', maxRetries, '次，仍未找到 RequestManager');
            console.error('showRequestManageView: 当前全局对象状态:', {
                'typeof RequestManager': typeof RequestManager,
                'typeof window': typeof window,
                'window.RequestManager': typeof window !== 'undefined' ? window.RequestManager : 'window未定义',
                'document.readyState': document.readyState,
                '所有脚本标签': Array.from(document.querySelectorAll('script[src]')).map(s => s.src)
            });
            alert('RequestManager 未加载，请刷新页面重试。如果问题持续，请检查浏览器控制台的错误信息。');
            return;
        }
        
        if (typeof RequestManagerRef.showRequestManagement !== 'function') {
            console.error('RequestManager.showRequestManagement 方法不存在');
            console.error('RequestManagerRef 的内容:', RequestManagerRef);
            console.error('RequestManagerRef 的方法:', Object.keys(RequestManagerRef || {}));
            alert('RequestManager 方法不存在，请刷新页面重试');
            return;
        }
        
        try {
            await RequestManagerRef.showRequestManagement();
            
            // 更新当前视图状态（但不自动保存，避免覆盖激活状态）
            Store.updateState({
                currentView: 'request',
                currentSubView: RequestManagerRef.currentView || 'configs',
                currentConfigId: RequestManagerRef.currentConfigId || null
            }, false); // 不自动保存，避免覆盖激活状态
        } catch (error) {
            console.error('显示个性化休假管理页面失败:', error);
            alert('显示个性化休假管理页面失败：' + error.message);
        }
    }
}

/**
 * 更新人员数据显示 - 渲染交互式排班表
 * 注意：此函数仅用于个性化需求录入页面，不应在人员管理页面调用
 */
// 防止重复执行的标志
let _isUpdatingStaffDisplay = false;

// 表格点击事件处理器（用于事件委托）
let _tableClickHandler = null;

function updateStaffDisplay() {
    // 防止重复执行
    if (_isUpdatingStaffDisplay) {
        console.warn('updateStaffDisplay: 正在执行中，跳过重复调用');
        return;
    }
    
    _isUpdatingStaffDisplay = true;
    console.log('updateStaffDisplay: 开始执行');
    
    try {
        const scheduleTable = document.getElementById('scheduleTable');
        const scheduleConfig = Store.getState('scheduleConfig');
        
        if (!scheduleTable) {
            console.warn('updateStaffDisplay: scheduleTable元素未找到');
            return;
        }
        
        console.log('updateStaffDisplay: scheduleTable找到，scheduleConfig:', scheduleConfig);
    
    // 优先检查是否在个性化需求子页面（requestList），如果是则允许渲染，跳过其他检查
    let isInRequestList = false;
    if (typeof RequestManager !== 'undefined') {
        const requestCurrentView = RequestManager.currentView;
        console.log('updateStaffDisplay: RequestManager存在，currentView =', requestCurrentView);
        console.log('updateStaffDisplay: RequestManager.currentConfigId =', RequestManager.currentConfigId);
        
        if (requestCurrentView === 'requestList') {
            // 在个性化需求子页面，允许渲染，跳过StaffManager的检查
            console.log('updateStaffDisplay: 在个性化需求子页面，允许渲染（跳过StaffManager检查）');
            isInRequestList = true;
        } else if (requestCurrentView === 'configs') {
            // 在个性化需求配置列表页面，不渲染个性化需求录入界面
            console.log('updateStaffDisplay: 在个性化需求配置列表页面，不渲染个性化需求录入界面');
            return;
        }
    }
    
    // 检查当前是否在人员管理页面，如果是则不渲染个性化需求录入界面
    // 注意：只有在不在个性化需求子页面时才检查这个
    if (!isInRequestList) {
        if (typeof StaffManager !== 'undefined' && StaffManager.currentView === 'configs') {
            // 在人员管理配置列表页面，不渲染个性化需求录入
            console.log('updateStaffDisplay: 在人员管理配置列表页面，不渲染');
            return;
        }
        if (typeof StaffManager !== 'undefined' && StaffManager.currentView === 'staffList') {
            // 在人员管理的人员列表页面，不渲染个性化需求录入
            console.log('updateStaffDisplay: 在人员管理的人员列表页面，不渲染');
            return;
        }
        
        // 如果RequestManager不存在，继续执行（兼容性处理）
        if (typeof RequestManager === 'undefined') {
            console.log('updateStaffDisplay: RequestManager不存在，继续执行');
        }
    }
    
    // 检查是否有人员配置（无论激活还是未激活）
    const staffConfigs = Store.getStaffConfigs();
    console.log('updateStaffDisplay: 人员配置数量:', staffConfigs ? staffConfigs.length : 0);
    
    if (!staffConfigs || staffConfigs.length === 0) {
        // 如果没有人员配置，清空显示并清空相关数据
        console.warn('updateStaffDisplay: 没有人员配置，清空显示');
        clearStaffDisplay();
        // 清空个性化需求数据
        Store.state.personalRequests = {};
        Store.state.restDays = {};
        // 清空需求配置
        Store.state.requestConfigs = [];
        Store.state.activeRequestConfigId = null;
        return;
    }
    
    // 获取所有人员数据用于筛选（从当前激活的人员配置）
    const allStaffData = Store.getCurrentStaffData();
    console.log('updateStaffDisplay: 人员数据数量:', allStaffData ? allStaffData.length : 0);
    
    // 如果没有人员数据或日期配置，显示提示
    if (!allStaffData || allStaffData.length === 0) {
        console.warn('updateStaffDisplay: 没有人员数据，显示提示');
        scheduleTable.innerHTML = `
            <div class="p-8 text-center text-gray-400">
                <p>请先上传人员数据</p>
            </div>
        `;
        return;
    }
    
    console.log('updateStaffDisplay: 排班周期检查 - startDate:', scheduleConfig && scheduleConfig.startDate, 'endDate:', scheduleConfig && scheduleConfig.endDate);
    
    if (!scheduleConfig || !scheduleConfig.startDate || !scheduleConfig.endDate) {
        console.warn('updateStaffDisplay: 排班周期未配置，显示提示');
        scheduleTable.innerHTML = `
            <div class="p-8 text-center text-gray-400">
                <p>请先配置日期范围</p>
            </div>
        `;
        return;
    }
    
    console.log('updateStaffDisplay: 所有检查通过，开始渲染日历表格');
    
    // 生成日期列表
    const dateList = generateDateList(scheduleConfig.startDate, scheduleConfig.endDate);
    
    // 获取所有个人休假需求
    const allPersonalRequests = Store.getAllPersonalRequests();
    // 获取法定休息日
    let allRestDays = Store.getAllRestDays();
    
    // 如果在个性化休假配置页面，从激活的排班周期配置中读取restDaysSnapshot
    if (isInRequestList) {
        const activeSchedulePeriodConfigId = Store.getState('activeSchedulePeriodConfigId');
        if (activeSchedulePeriodConfigId) {
            const activeSchedulePeriodConfig = Store.getSchedulePeriodConfig(activeSchedulePeriodConfigId);
            if (activeSchedulePeriodConfig && activeSchedulePeriodConfig.restDaysSnapshot) {
                // 使用激活的排班周期配置的restDaysSnapshot
                allRestDays = JSON.parse(JSON.stringify(activeSchedulePeriodConfig.restDaysSnapshot));
                console.log('updateStaffDisplay: 在个性化休假配置页面，使用激活的排班周期配置的restDaysSnapshot，共', Object.keys(allRestDays).length, '天');
                // 同步到Store.state.restDays，确保后续逻辑使用正确的数据
                Store.state.restDays = allRestDays;
            } else {
                console.warn('updateStaffDisplay: 激活的排班周期配置没有restDaysSnapshot，使用当前restDays');
            }
        } else {
            console.warn('updateStaffDisplay: 没有激活的排班周期配置，使用当前restDays');
        }
    }
    
    // 计算连通性（与排班周期管理一致）：休息日与特殊节假日连续（任意长度）则视为连通
    // 1. 构建特殊节假日集合（包含所有有 holidayName、lunarHoliday 或 fixedHoliday 的日期）
    const specialSet = new Set();
    dateList.forEach(dateInfo => {
        const holidayName = dateInfo.holidayName || '';
        const isFixedHolidayFn = typeof HolidayManager !== 'undefined' ? HolidayManager.isFixedHoliday.bind(HolidayManager) : isFixedHoliday;
        const isFixed = isFixedHolidayFn(dateInfo.dateStr);
        const lunarHolidayFn = typeof LunarHolidays !== 'undefined' ? LunarHolidays.getHoliday.bind(LunarHolidays) : null;
        const lunarHoliday = lunarHolidayFn ? lunarHolidayFn(dateInfo.dateStr) : null;
        
        if (holidayName || isFixed || lunarHoliday) {
            specialSet.add(dateInfo.dateStr);
        }
    });
    
    // 2. 计算休息日标志
    const restFlags = dateList.map((dateInfo) => {
        const dateStr = dateInfo.dateStr;
        const isWeekend = dateInfo.isWeekend;
        const hasOverride = Object.prototype.hasOwnProperty.call(allRestDays, dateStr);
        return hasOverride ? allRestDays[dateStr] === true : isWeekend;
    });
    
    // 3. 计算特殊节假日标志
    const specialFlags = dateList.map(dateInfo => specialSet.has(dateInfo.dateStr));
    
    // 4. 计算连通性（左右传播算法，与排班周期管理一致）
    const connectedToSpecial = new Array(dateList.length).fill(false);
    // 标记特殊节假日自身
    specialFlags.forEach((v, idx) => { if (v) connectedToSpecial[idx] = true; });
    // 左到右传播
    for (let i = 1; i < dateList.length; i++) {
        if (restFlags[i] && (connectedToSpecial[i - 1] || specialFlags[i - 1])) {
            connectedToSpecial[i] = true;
        }
    }
    // 右到左传播
    for (let i = dateList.length - 2; i >= 0; i--) {
        if (restFlags[i] && (connectedToSpecial[i + 1] || specialFlags[i + 1])) {
            connectedToSpecial[i] = true;
        }
    }
    
    // 校验所有人员的休假需求（异步执行，先显示界面，校验完成后更新）
    // 使用全局变量存储校验结果，以便在重新渲染时使用
    if (!window._currentValidationResults) {
        window._currentValidationResults = {};
    }
    // 使用缓存的校验结果（如果有），否则使用空对象
    let validationResults = window._currentValidationResults;
    
    // 加载并显示当前休息日规则配置（在渲染后更新）
    setTimeout(async () => {
        try {
            let rules = { maxRestDays: 3, maxWeekendRestDays: 2 };
            if (typeof DB !== 'undefined' && DB.db) {
                rules = await DB.loadRestDayRules();
            }
            // 更新规则提示文本
            const maxRestDaysSpan = document.getElementById('restDayRulesMaxRestDays');
            const maxWeekendRestDaysSpan = document.getElementById('restDayRulesMaxWeekendRestDays');
            if (maxRestDaysSpan) {
                maxRestDaysSpan.textContent = rules.maxRestDays || 3;
            }
            if (maxWeekendRestDaysSpan) {
                maxWeekendRestDaysSpan.textContent = rules.maxWeekendRestDays || 2;
            }
        } catch (error) {
            console.warn('加载休息日规则失败:', error);
        }
    }, 100);
    
    // 立即开始校验，但先渲染界面
    // 注意：校验完成后不重新调用updateStaffDisplay，避免无限循环
    // 校验结果会存储在window._currentValidationResults中，下次渲染时会使用
    (async () => {
        try {
            const results = await Validators.validateAllPersonalRequests(allPersonalRequests, scheduleConfig);
            // 存储校验结果到全局变量
            window._currentValidationResults = results;
            console.log('updateStaffDisplay: 校验完成，结果已存储，不重新渲染以避免循环');
            // 不再调用updateStaffDisplay()，避免无限循环
            // 如果需要显示校验结果，可以在下次用户操作时触发重新渲染
        } catch (error) {
            console.error('校验失败:', error);
            // 校验失败时使用空结果
            window._currentValidationResults = {};
        }
    })();
    
    // 初始化筛选状态（用于HTML模板，无论是否使用StaffFilter都需要）
    if (!window._staffFilterState) {
        // 默认全部勾选人员类型和归属地
        const allPersonTypes = ['全人力侦测', '半人力授权+侦测', '全人力授权+大夜侦测', '授权人员支援侦测+大夜授权'];
        const allLocations = ['上海', '成都'];
        window._staffFilterState = {
            personTypes: allPersonTypes, // 默认全部勾选
            locations: allLocations, // 默认全部勾选
            idFilter: '',
            nameFilter: ''
        };
    }
    
    // 确保 filterState 变量存在（用于HTML模板）
    const filterState = window._staffFilterState;
    
    // 使用 StaffFilter 应用筛选条件
    let filteredStaffData = allStaffData;
    if (typeof StaffFilter !== 'undefined' && StaffFilter.applyFilter) {
        // 更新筛选状态（从DOM读取，如果DOM存在）
        const idInput = document.getElementById('filterId');
        const nameInput = document.getElementById('filterName');
        if (idInput) {
            filterState.idFilter = idInput.value || '';
        }
        if (nameInput) {
            filterState.nameFilter = nameInput.value || '';
        }
        
        // 更新全局状态
        window._staffFilterState = filterState;
        
        // 应用筛选
        filteredStaffData = StaffFilter.applyFilter(allStaffData);
    } else {
        // 后备方案：如果StaffFilter未加载，使用原有逻辑
        const filterState = window._staffFilterState;
        
        // 应用筛选条件
        filteredStaffData = allStaffData.filter(staff => {
            const staffId = String(staff.staffId || staff.id || '').toLowerCase();
            const staffName = String(staff.name || '').toLowerCase();
            const staffPersonType = staff.personType || '';
            const staffLocation = staff.location || '';
            
            // 人员类型筛选（多选）- 如果选择了类型，则必须匹配
            if (filterState.personTypes.length > 0) {
                // 获取所有可用的人员类型
                const allPersonTypes = ['全人力侦测', '半人力授权+侦测', '全人力授权+大夜侦测', '授权人员支援侦测+大夜授权'];
                // 如果选择的类型数量等于全部类型数量，说明全部勾选，不过滤
                if (filterState.personTypes.length < allPersonTypes.length && !filterState.personTypes.includes(staffPersonType)) {
                    return false;
                }
            }
            
            // 归属地筛选（多选）- 如果选择了归属地，则必须匹配
            if (filterState.locations.length > 0) {
                // 获取所有可用的归属地
                const allLocations = ['上海', '成都'];
                // 如果选择的归属地数量等于全部归属地数量，说明全部勾选，不过滤
                if (filterState.locations.length < allLocations.length && !filterState.locations.includes(staffLocation)) {
                    return false;
                }
            }
            
            // ID筛选（模糊匹配+精准匹配）
            if (filterState.idFilter.trim()) {
                const idFilter = filterState.idFilter.trim().toLowerCase();
                if (staffId !== idFilter && !staffId.includes(idFilter)) {
                    return false;
                }
            }
            
            // 姓名筛选（模糊匹配+精准匹配）
            if (filterState.nameFilter.trim()) {
                const nameFilter = filterState.nameFilter.trim().toLowerCase();
                if (staffName !== nameFilter && !staffName.includes(nameFilter)) {
                    return false;
                }
            }
            
            return true;
        });
    }
    
    // 使用筛选后的人员数据
    const displayStaffData = filteredStaffData;
    
    // 获取当前需求配置名称
    let currentConfigName = '未命名配置';
    if (typeof RequestManager !== 'undefined' && RequestManager.currentConfigId) {
        const config = Store.getRequestConfig(RequestManager.currentConfigId);
        if (config && config.name) {
            currentConfigName = config.name;
        }
    }
    
    // 创建表格HTML
    let html = `
        <div class="p-4 border-b border-gray-200 bg-white">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center space-x-2">
                    <h2 class="text-lg font-bold text-gray-800">个性化需求录入</h2>
                    <span class="text-sm text-gray-500">-</span>
                    <input type="text" 
                           id="requestConfigNameInput" 
                           value="${currentConfigName}"
                           class="text-sm text-gray-500 bg-transparent border-b border-gray-300 focus:border-blue-500 focus:outline-none px-1 py-0.5"
                           style="width: 40ch;"
                           placeholder="输入配置名称"
                           onblur="updateRequestConfigName()"
                           onkeypress="if(event.key === 'Enter') { this.blur(); }">
                </div>
                <div class="flex items-center space-x-2" id="requestActionButtons">
                    <!-- 按钮将通过 addSubPageButtons 动态添加 -->
                </div>
            </div>
            
            <!-- 筛选区域 -->
            <div class="bg-gray-50 p-3 rounded-lg mb-3 border border-gray-200">
                <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <!-- ID筛选 -->
                    <div>
                        <label class="block text-xs font-medium text-gray-700 mb-1">ID（模糊/精准匹配）</label>
                        <input type="text" id="filterId" 
                               value="${filterState.idFilter}"
                               placeholder="输入ID进行筛选"
                               class="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                               onblur="applyStaffFilter()">
                    </div>
                    
                    <!-- 姓名筛选 -->
                    <div>
                        <label class="block text-xs font-medium text-gray-700 mb-1">姓名（模糊/精准匹配）</label>
                        <input type="text" id="filterName" 
                               value="${filterState.nameFilter}"
                               placeholder="输入姓名进行筛选"
                               class="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                               onblur="applyStaffFilter()">
                    </div>
                    
                    <!-- 归属地筛选 -->
                    <div class="relative">
                        <label class="block text-xs font-medium text-gray-700 mb-1">归属地（多选）</label>
                        <div class="relative">
                            <input type="text" id="filterLocationDisplay" 
                                   readonly
                                   value="${filterState.locations.length === 2 ? '全部' : filterState.locations.join(', ')}"
                                   placeholder="点击选择归属地"
                                   class="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs bg-white cursor-pointer"
                                   onclick="toggleLocationFilterDropdown()">
                            <div id="filterLocationDropdown" class="hidden absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg" style="max-height: 150px; overflow-y: auto;">
                                <label class="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer">
                                    <input type="checkbox" id="filterLocationAll" 
                                           ${filterState.locations.length === 2 ? 'checked' : ''}
                                           onchange="toggleLocationFilterAll(this)"
                                           class="mr-2">
                                    <span class="text-xs">全部</span>
                                </label>
                                <label class="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer">
                                    <input type="checkbox" id="filterLocationShanghai" 
                                           ${filterState.locations.includes('上海') ? 'checked' : ''}
                                           onchange="updateLocationFilter()"
                                           class="mr-2">
                                    <span class="text-xs">上海</span>
                                </label>
                                <label class="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer">
                                    <input type="checkbox" id="filterLocationChengdu" 
                                           ${filterState.locations.includes('成都') ? 'checked' : ''}
                                           onchange="updateLocationFilter()"
                                           class="mr-2">
                                    <span class="text-xs">成都</span>
                                </label>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 人员类型筛选 -->
                    <div class="relative">
                        <label class="block text-xs font-medium text-gray-700 mb-1">人员类型（多选）</label>
                        <div class="relative">
                            <input type="text" id="filterPersonTypeDisplay" 
                                   readonly
                                   value="${filterState.personTypes.length === 4 ? '全部' : filterState.personTypes.join(', ')}"
                                   placeholder="点击选择人员类型"
                                   class="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs bg-white cursor-pointer"
                                   onclick="togglePersonTypeFilterDropdown()">
                            <div id="filterPersonTypeDropdown" class="hidden absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg" style="max-height: 150px; overflow-y: auto;">
                                <label class="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer">
                                    <input type="checkbox" id="filterPersonTypeAll" 
                                           ${filterState.personTypes.length === 4 ? 'checked' : ''}
                                           onchange="togglePersonTypeFilterAll(this)"
                                           class="mr-2">
                                    <span class="text-xs">全部</span>
                                </label>
                                <label class="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer">
                                    <input type="checkbox" id="filterPersonType1" 
                                           ${filterState.personTypes.includes('全人力侦测') ? 'checked' : ''}
                                           onchange="updatePersonTypeFilter()"
                                           class="mr-2">
                                    <span class="text-xs">全人力侦测</span>
                                </label>
                                <label class="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer">
                                    <input type="checkbox" id="filterPersonType2" 
                                           ${filterState.personTypes.includes('半人力授权+侦测') ? 'checked' : ''}
                                           onchange="updatePersonTypeFilter()"
                                           class="mr-2">
                                    <span class="text-xs">半人力授权+侦测</span>
                                </label>
                                <label class="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer">
                                    <input type="checkbox" id="filterPersonType3" 
                                           ${filterState.personTypes.includes('全人力授权+大夜侦测') ? 'checked' : ''}
                                           onchange="updatePersonTypeFilter()"
                                           class="mr-2">
                                    <span class="text-xs">全人力授权+大夜侦测</span>
                                </label>
                                <label class="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer">
                                    <input type="checkbox" id="filterPersonType4" 
                                           ${filterState.personTypes.includes('授权人员支援侦测+大夜授权') ? 'checked' : ''}
                                           onchange="updatePersonTypeFilter()"
                                           class="mr-2">
                                    <span class="text-xs">授权人员支援侦测+大夜授权</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="mt-2 flex items-center justify-between">
                    <button onclick="clearStaffFilter()" 
                            class="px-3 py-1 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors text-xs font-medium">
                        清除筛选
                    </button>
                    <span class="text-xs text-gray-600">
                        显示 ${displayStaffData.length} / ${allStaffData.length} 条记录
                    </span>
                </div>
            </div>
            
            <div class="text-xs text-gray-500 mb-2">
                ${isInRequestList ? 
                    '<p>说明：法定休息日不可在此页面修改，请在排班周期管理中修改；点击人员单元格切换休假需求（空/休）。</p>' : 
                    '<p>说明：点击"法定休息日"行切换工作日/休息日；点击人员单元格切换休假需求（空/休）。</p>'}
                <p id="restDayRulesHint" class="text-blue-600 font-medium">规则：指定休息日不能超过<span id="restDayRulesMaxRestDays">3</span>天，周末指定休息日不能超过<span id="restDayRulesMaxWeekendRestDays">2</span>天（旅游连休除外）。</p>
            </div>
        </div>
        <div class="overflow-x-auto overflow-y-auto" style="max-height: calc(100vh - 300px);">
            <table class="min-w-full divide-y divide-gray-200 border-collapse" style="table-layout: fixed;">
                <thead class="bg-gray-50" style="position: sticky; top: 0; z-index: 20;">
                    <tr>
                        <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300" style="width: 40px; min-width: 40px;">状态</th>
                        <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300" style="width: 60px; min-width: 60px;">ID</th>
                        <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300" style="width: 70px; min-width: 70px;">姓名</th>
                        <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-blue-100" style="width: 100px; min-width: 100px;">人员类型</th>
                        <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-green-100" style="width: 80px; min-width: 80px;">归属地</th>
    `;
    
    // 生成日期表头
    dateList.forEach(dateInfo => {
        const holidayName = dateInfo.holidayName || '';
        const isWeekend = dateInfo.isWeekend;
        const isHoliday = dateInfo.isHoliday;
        
        // 优先级：节假日 > 周末 > 工作日
        // 节假日：红色背景（bg-red-100），红色文字（text-red-700），更明显的红色边框
        // 周末：黄色背景（bg-yellow-50），黄色文字（text-yellow-700）
        // 工作日：灰色背景（bg-gray-50），灰色文字（text-gray-700）
        const bgColor = isHoliday ? 'bg-red-100' : isWeekend ? 'bg-yellow-50' : 'bg-gray-50';
        const textColor = isHoliday ? 'text-red-700' : isWeekend ? 'text-yellow-700' : 'text-gray-700';
        const borderColor = isHoliday ? 'border-red-300' : isWeekend ? 'border-yellow-200' : 'border-gray-300';
        
        // 构建提示信息
        let titleText = dateInfo.dateStr;
        if (holidayName) {
            titleText += ` - ${holidayName}`;
        }
        if (isWeekend && !isHoliday) {
            titleText += ' (周末)';
        }
        
        html += `
            <th class="px-0.5 py-1 text-center text-xs font-medium ${textColor} uppercase border ${borderColor} ${bgColor}" 
                style="width: 30px; min-width: 30px; position: relative;" 
                title="${titleText}">
                <div class="text-xs font-bold">${dateInfo.day}</div>
                <div class="text-xs">${dateInfo.weekday}</div>
                ${holidayName ? `<div class="text-[10px] text-red-600 font-semibold mt-0.5">${holidayName}</div>` : ''}
            </th>
        `;
    });
    
    html += `
                    </tr>
                    <!-- 法定休息日行 - 固定在表头 -->
                    <tr class="bg-blue-50 font-semibold" style="position: sticky; top: 0; z-index: 19;">
                        <td class="px-1 py-1 text-center text-xs text-gray-700 border border-gray-300" colspan="5">班别配置</td>
    `;
    
    // 法定休息日行（颜色逻辑与排班周期管理一致，特殊节假日和连通的休息日不可切换）
    dateList.forEach((dateInfo, idx) => {
        const dateStr = dateInfo.dateStr;
        const isRestDay = Store.isRestDay(dateStr);
        const isFixedHolidayFn = typeof HolidayManager !== 'undefined' ? HolidayManager.isFixedHoliday.bind(HolidayManager) : isFixedHoliday;
        const isFixed = isFixedHolidayFn(dateStr);
        const holidayName = dateInfo.holidayName || '';
        const lunarHolidayFn = typeof LunarHolidays !== 'undefined' ? LunarHolidays.getHoliday.bind(LunarHolidays) : null;
        const lunarHoliday = lunarHolidayFn ? lunarHolidayFn(dateStr) : null;
        
        // 判断是否是特殊节假日
        const isSpecial = holidayName || isFixed || lunarHoliday;
        const isConnected = connectedToSpecial[idx];
        
        // 判断是否可切换：
        // 1. 如果在个性化休假配置页面，所有日期都不可切换（完全引用排班周期配置）
        // 2. 否则，特殊节假日（无论休息日还是工作日）和连通的休息日不可切换（与排班周期配置保持一致）
        const isLocked = isInRequestList || isSpecial || (isRestDay && isConnected);
        
        // 颜色渲染逻辑（与排班周期管理完全一致）：
        // 1. 特殊节假日 + 休息日 -> 红色（bg-red-500），不可切换
        // 2. 特殊节假日 + 工作日 -> 灰色（bg-gray-50），不可切换
        // 3. 与特殊节假日连通的休息日 -> 红色（bg-red-500），不可切换
        // 4. 普通休息日（未连通特殊假日）-> 蓝色（bg-blue-400），可切换
        // 5. 普通工作日 -> 灰色（bg-gray-50），可切换
        let restDayClass, titleText, cursorClass;
        
        // 如果在个性化休假配置页面，所有日期都不可切换，提示信息统一指向排班周期管理
        if (isInRequestList) {
            if (isSpecial && isRestDay) {
                // 特殊节假日且是休息日 -> 红色，不可切换
                restDayClass = 'bg-red-500 text-white';
                cursorClass = 'cursor-not-allowed opacity-90';
                titleText = `特殊节假日（休息日），不可切换，请在排班周期管理中修改`;
            } else if (isSpecial && !isRestDay) {
                // 特殊节假日但被设为工作日 -> 灰色，不可切换
                restDayClass = 'bg-gray-50 text-gray-800';
                cursorClass = 'cursor-not-allowed opacity-90';
                titleText = `特殊节假日（工作日），不可切换，请在排班周期管理中修改`;
            } else if (isRestDay && isConnected) {
                // 与特殊节假日连通的休息日 -> 红色，不可切换
                restDayClass = 'bg-red-500 text-white';
                cursorClass = 'cursor-not-allowed opacity-90';
                titleText = `与特殊节假日连通的休息日，不可切换，请在排班周期管理中修改`;
            } else if (isRestDay) {
                // 休息日（周末或工作日被标记为休息）未连通特殊假日 -> 蓝色，不可切换
                restDayClass = 'bg-blue-400 text-white';
                cursorClass = 'cursor-not-allowed opacity-90';
                titleText = `休息日，不可切换，请在排班周期管理中修改`;
            } else {
                // 工作日（包含特殊节假日被设为工作日、周末被设为工作日、普通工作日）-> 灰色，不可切换
                restDayClass = 'bg-gray-50 text-gray-800';
                cursorClass = 'cursor-not-allowed opacity-90';
                titleText = `工作日，不可切换，请在排班周期管理中修改`;
            }
        } else {
            // 不在个性化休假配置页面，保持原有逻辑
            if (isSpecial && isRestDay) {
                // 特殊节假日且是休息日 -> 红色，不可切换
                restDayClass = 'bg-red-500 text-white';
                cursorClass = 'cursor-not-allowed opacity-90';
                titleText = `特殊节假日（休息日），不可切换，请在排班周期管理中修改`;
            } else if (isSpecial && !isRestDay) {
                // 特殊节假日但被设为工作日 -> 灰色，不可切换
                restDayClass = 'bg-gray-50 text-gray-800';
                cursorClass = 'cursor-not-allowed opacity-90';
                titleText = `特殊节假日（工作日），不可切换，请在排班周期管理中修改`;
            } else if (isRestDay && isConnected) {
                // 与特殊节假日连通的休息日 -> 红色，不可切换
                restDayClass = 'bg-red-500 text-white';
                cursorClass = 'cursor-not-allowed opacity-90';
                titleText = `与特殊节假日连通的休息日，不可切换，请在排班周期管理中修改`;
            } else if (isRestDay) {
                // 休息日（周末或工作日被标记为休息）未连通特殊假日 -> 蓝色，可切换
                restDayClass = 'bg-blue-400 hover:bg-blue-500 text-white';
                cursorClass = 'cursor-pointer';
                titleText = `休息日，点击切换为工作日`;
            } else {
                // 工作日（包含特殊节假日被设为工作日、周末被设为工作日、普通工作日）-> 灰色，可切换
                restDayClass = 'bg-gray-50 hover:bg-gray-100 text-gray-800';
                cursorClass = 'cursor-pointer';
                titleText = `工作日，点击切换为休息日`;
            }
        }
        
        html += `
            <td class="px-0.5 py-1 text-center text-xs border border-gray-300 ${cursorClass} ${restDayClass} transition-colors font-semibold"
                data-date="${dateStr}"
                data-rest-day-cell="true"
                data-locked="${isLocked}"
                title="${titleText}"
                ${isLocked ? 'style="user-select: none; pointer-events: none;"' : 'style="user-select: none;"'}
                ${!isLocked ? `onclick="toggleRestDay('${dateStr}'); return false;"` : ''}>
                ${isRestDay ? '休' : '班'}
            </td>
        `;
    });
    
    html += `
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
    `;
    
    // 生成人员行（使用筛选后的数据）
    displayStaffData.forEach((staff, index) => {
        const staffId = staff.staffId || staff.id;
        const rowClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
        const personalRequests = allPersonalRequests[staffId] || {};
        
        const validation = validationResults[staffId] || { isValid: true, errors: [] };
        const hasError = !validation.isValid;
        const errorTooltip = hasError ? validation.errors.join('；') : '';
        
        html += `
            <tr class="${rowClass}" data-staff-id="${staffId}">
                <td class="px-1 py-1 text-center border border-gray-300 align-middle">
                    ${hasError ? `
                        <span class="inline-block w-4 h-4 bg-red-500 rounded-full cursor-help" 
                              title="${errorTooltip}"
                              style="position: relative;">
                            <span class="absolute inset-0 flex items-center justify-center text-white text-[10px]">!</span>
                        </span>
                    ` : '<span class="inline-block w-4 h-4"></span>'}
                </td>
                <td class="px-1 py-1 text-center text-xs text-gray-900 border border-gray-300">${staff.id}</td>
                <td class="px-1 py-1 text-center text-xs font-medium text-gray-900 border border-gray-300">${staff.name || ''}</td>
                <td class="px-1 py-1 text-center text-xs font-medium text-blue-700 border border-gray-300 bg-blue-50">${staff.personType || '未设置'}</td>
                <td class="px-1 py-1 text-center text-xs font-medium text-green-700 border border-gray-300 bg-green-50">${staff.location || '未设置'}</td>
        `;
        
        dateList.forEach((dateInfo, idx) => {
            const dateStr = dateInfo.dateStr;
            const isRequested = personalRequests[dateStr] === 'REQ';
            const isRestDay = Store.isRestDay(dateStr);
            const isFixedHolidayFn = typeof HolidayManager !== 'undefined' ? HolidayManager.isFixedHoliday.bind(HolidayManager) : isFixedHoliday;
            const isFixed = isFixedHolidayFn(dateStr);
            const holidayName = dateInfo.holidayName || '';
            const lunarHolidayFn = typeof LunarHolidays !== 'undefined' ? LunarHolidays.getHoliday.bind(LunarHolidays) : null;
            const lunarHoliday = lunarHolidayFn ? lunarHolidayFn(dateStr) : null;
            
            // 判断是否是特殊节假日
            const isSpecial = holidayName || isFixed || lunarHoliday;
            const isConnected = connectedToSpecial[idx];
            
            // 单元格样式和内容（颜色逻辑与排班周期管理一致）
            let cellClass = 'bg-white hover:bg-gray-100';
            let displayText = '';
            
            if (isRequested) {
                // 有休假需求
                // 颜色渲染逻辑（与排班周期管理一致）：
                // 1. 特殊节假日 + 休息日 -> 红色（bg-red-500）
                // 2. 与特殊节假日连通的休息日 -> 红色（bg-red-500）
                // 3. 普通休息日（未连通特殊假日）-> 蓝色（bg-blue-400）
                // 4. 工作日休假 -> 蓝色（bg-blue-500）
                if ((isSpecial && isRestDay) || (isRestDay && isConnected)) {
                    // 特殊节假日或与特殊节假日连通的休息日 -> 红色
                    cellClass = 'bg-red-500 hover:bg-red-600 text-white font-semibold';
                    displayText = '休';
                } else {
                    // 普通休息日（未连通特殊假日）或工作日休假 -> 蓝色
                    cellClass = 'bg-blue-400 hover:bg-blue-500 text-white font-semibold';
                    displayText = '休';
                }
            } else {
                // 无休假需求
                cellClass = 'bg-white hover:bg-gray-100';
                displayText = '';
            }
            
            html += `
                <td class="px-0.5 py-1 text-center text-xs border border-gray-300 cursor-pointer ${cellClass} transition-colors"
                    data-staff-id="${staffId}"
                    data-date="${dateStr}"
                    data-personal-request-cell="true"
                    title="${isRequested ? ((isSpecial && isRestDay) || (isRestDay && isConnected) ? '特殊节假日/连通休假' : isRestDay ? '普通休息日休假' : '工作日休假') : '点击申请休假'}"
                    style="user-select: none;">
                    ${displayText}
                </td>
            `;
        });
        
        html += `
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
        <div class="p-4 bg-gray-50 border-t border-gray-200">
            <p class="text-sm text-gray-600">共 ${displayStaffData.length} / ${allStaffData.length} 条有效人员记录，${dateList.length} 天排班周期</p>
        </div>
    `;
    
        console.log('updateStaffDisplay: 准备设置innerHTML，HTML长度:', html.length);
        console.log('updateStaffDisplay: HTML前500字符:', html.substring(0, 500));
        
        // 保存滚动位置（在更新innerHTML之前）
        let savedScrollTop = 0;
        let savedScrollLeft = 0;
        const scrollContainer = scheduleTable.querySelector('.overflow-x-auto.overflow-y-auto');
        if (scrollContainer) {
            savedScrollTop = scrollContainer.scrollTop || 0;
            savedScrollLeft = scrollContainer.scrollLeft || 0;
            console.log('updateStaffDisplay: 保存滚动位置', { scrollTop: savedScrollTop, scrollLeft: savedScrollLeft });
        }
        
        // 清除加载提示并设置HTML
        scheduleTable.innerHTML = html;
        console.log('updateStaffDisplay: innerHTML已设置');
        
        // 立即验证表格是否成功创建并绑定事件
        setTimeout(() => {
            const table = scheduleTable.querySelector('table');
            if (table) {
                console.log('updateStaffDisplay: 表格已成功创建，行数:', table.querySelectorAll('tr').length);
                
                // 恢复滚动位置（在DOM更新后）
                const newScrollContainer = scheduleTable.querySelector('.overflow-x-auto.overflow-y-auto');
                if (newScrollContainer) {
                    // 使用 requestAnimationFrame 确保 DOM 完全渲染后再恢复滚动位置
                    requestAnimationFrame(() => {
                        newScrollContainer.scrollTop = savedScrollTop;
                        newScrollContainer.scrollLeft = savedScrollLeft;
                        console.log('updateStaffDisplay: 滚动位置已恢复', { scrollTop: savedScrollTop, scrollLeft: savedScrollLeft });
                    });
                }
                
                // 移除旧的事件监听器（如果存在）
                if (_tableClickHandler) {
                    table.removeEventListener('click', _tableClickHandler, true);
                }
                
                // 创建新的事件处理器
                _tableClickHandler = (e) => {
                    const target = e.target;
                    // 查找最近的 td 元素（可能是点击的 td 本身，也可能是 td 内的文本节点）
                    const td = target.closest('td');
                    
                    if (!td) {
                        return; // 如果找不到 td，直接返回
                    }
                    
                    const dateStr = td.getAttribute('data-date');
                    const staffId = td.getAttribute('data-staff-id');
                    const isRestDayCell = td.hasAttribute('data-rest-day-cell');
                    const isPersonalRequestCell = td.hasAttribute('data-personal-request-cell');
                    
                    console.log('表格点击事件触发:', { 
                        dateStr, 
                        staffId, 
                        isRestDayCell,
                        isPersonalRequestCell,
                        target: target.tagName, 
                        tdClass: td.className,
                        tdElement: td
                    });
                    
                    // 优先检查是否是休息日单元格
                    if (isRestDayCell && dateStr) {
                        // 这是休息日行的单元格
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // 检查是否在个性化休假配置页面
                        const isInRequestListPage = typeof RequestManager !== 'undefined' && RequestManager.currentView === 'requestList';
                        if (isInRequestListPage) {
                            console.log('检测到在个性化休假配置页面，休息日单元格不可切换:', dateStr);
                            alert('法定休息日不可在此页面修改，请在排班周期管理中修改');
                            return;
                        }
                        
                        // 检查是否被锁定（特殊节假日或连通的休息日不可切换）
                        const isLocked = td.getAttribute('data-locked') === 'true';
                        if (isLocked) {
                            console.log('检测到锁定的休息日单元格，不允许切换:', dateStr);
                            alert('特殊节假日和连通的休息日不可切换，请在排班周期管理中修改');
                            return;
                        }
                        
                        console.log('检测到休息日单元格，调用toggleRestDay:', dateStr);
                        
                        // 调用函数，优先使用 window 对象，回退到直接调用
                        try {
                            let toggleFn = null;
                            if (typeof window !== 'undefined' && typeof window.toggleRestDay === 'function') {
                                toggleFn = window.toggleRestDay;
                            } else if (typeof toggleRestDay === 'function') {
                                toggleFn = toggleRestDay;
                            }
                            
                            if (toggleFn) {
                                const result = toggleFn(dateStr);
                                if (result && typeof result.catch === 'function') {
                                    result.catch(err => {
                                        console.error('toggleRestDay执行失败:', err);
                                        alert('切换休息日失败：' + err.message);
                                    });
                                }
                            } else {
                                console.error('toggleRestDay函数未找到');
                                alert('切换休息日功能未加载，请刷新页面');
                            }
                        } catch (error) {
                            console.error('调用toggleRestDay时出错:', error);
                            alert('切换休息日时出错：' + error.message);
                        }
                        return;
                    }
                    
                    // 检查是否是人员行的单元格
                    if (isPersonalRequestCell && dateStr && staffId) {
                        // 这是人员行的单元格
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('检测到人员单元格，调用togglePersonalRequest:', staffId, dateStr);
                        
                        // 调用函数，优先使用 window 对象，回退到直接调用
                        try {
                            let toggleFn = null;
                            if (typeof window !== 'undefined' && typeof window.togglePersonalRequest === 'function') {
                                toggleFn = window.togglePersonalRequest;
                            } else if (typeof togglePersonalRequest === 'function') {
                                toggleFn = togglePersonalRequest;
                            }
                            
                            if (toggleFn) {
                                console.log('togglePersonalRequest: 开始调用函数, staffId:', staffId, 'dateStr:', dateStr);
                                // 直接调用 async 函数并等待完成
                                const result = toggleFn(staffId, dateStr);
                                console.log('togglePersonalRequest: 函数调用完成, result:', result);
                                
                                // 确保 Promise 被正确处理
                                if (result && typeof result.then === 'function') {
                                    // 如果是 Promise，等待完成并处理错误
                                    result.then(() => {
                                        console.log('togglePersonalRequest: Promise 完成，重新渲染应该已触发');
                                    }).catch(err => {
                                        console.error('togglePersonalRequest执行失败:', err);
                                        alert('切换休假需求失败：' + err.message);
                                    });
                                } else if (result && typeof result.catch === 'function') {
                                    // 兼容性处理
                                    result.catch(err => {
                                        console.error('togglePersonalRequest执行失败:', err);
                                        alert('切换休假需求失败：' + err.message);
                                    });
                                }
                            } else {
                                console.error('togglePersonalRequest函数未找到');
                                alert('切换休假需求功能未加载，请刷新页面');
                            }
                        } catch (error) {
                            console.error('调用togglePersonalRequest时出错:', error);
                            alert('切换休假需求时出错：' + error.message);
                        }
                        return;
                    }
                    
                    // 如果都不匹配，记录日志
                    console.log('点击的单元格不匹配任何条件:', {
                        dateStr,
                        staffId,
                        isRestDayCell,
                        isPersonalRequestCell
                    });
                };
                
                // 添加事件委托，使用冒泡阶段（默认）
                // 注意：使用冒泡阶段而不是捕获阶段，因为我们需要在事件到达目标元素后处理
                table.addEventListener('click', _tableClickHandler, false);
                
                // 验证事件监听器是否成功添加
                const hasListener = table.onclick !== null || 
                    (table.addEventListener && typeof _tableClickHandler === 'function');
                console.log('updateStaffDisplay: 事件委托已添加', {
                    hasListener: !!hasListener,
                    handlerType: typeof _tableClickHandler,
                    tableElement: table
                });
            } else {
                console.error('updateStaffDisplay: 表格创建失败！scheduleTable内容:', scheduleTable.innerHTML.substring(0, 500));
            }
            
            // 如果是在个性化休假页面，重新添加按钮
            if (typeof RequestManager !== 'undefined' && RequestManager.currentView === 'requestList') {
                // 延迟添加按钮，确保表格已完全渲染
                setTimeout(() => {
                    RequestManager.addSubPageButtons();
                }, 200);
            }
        }, 100); // 延迟100ms确保DOM完全渲染
    } finally {
        // 重置标志，允许下次调用
        _isUpdatingStaffDisplay = false;
        console.log('updateStaffDisplay: 执行完成，标志已重置');
    }
}

/**
 * 生成日期列表
 * @param {string} startDateStr - 开始日期（YYYY-MM-DD）
 * @param {string} endDateStr - 结束日期（YYYY-MM-DD）
 * @returns {Array} 日期信息数组
 */
function generateDateList(startDateStr, endDateStr) {
    const dateList = [];
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    const currentDate = new Date(startDate);
    
    // 获取法定节假日（返回对象格式）
    const getHolidaysFn = typeof HolidayManager !== 'undefined' ? HolidayManager.getHolidays.bind(HolidayManager) : getHolidays;
    const holidays = getHolidaysFn(startDate.getFullYear());
    
    // 如果跨年，也需要获取下一年的节假日
    if (endDate.getFullYear() > startDate.getFullYear()) {
        const nextYearHolidays = getHolidaysFn(endDate.getFullYear());
        Object.assign(holidays, nextYearHolidays);
    }
    
    const formatFn = typeof DateUtils !== 'undefined' ? DateUtils.formatDate.bind(DateUtils) : formatDate;
    while (currentDate <= endDate) {
        const dateStr = formatFn(currentDate);
        const dayOfWeek = currentDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const holidayName = holidays[dateStr] || '';
        const isHoliday = !!holidayName;
        
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        
        dateList.push({
            dateStr: dateStr,
            date: new Date(currentDate),
            day: currentDate.getDate(),
            weekday: weekdays[dayOfWeek],
            isWeekend: isWeekend,
            isHoliday: isHoliday,
            holidayName: holidayName
        });
        
        // 移动到下一天
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dateList;
}

/**
 * 切换法定休息日
 * @param {string} dateStr - 日期（YYYY-MM-DD格式）
 */
async function toggleRestDay(dateStr) {
    // 使用 RestDayManager 处理休息日切换
    if (typeof RestDayManager !== 'undefined' && RestDayManager.toggleRestDay) {
        await RestDayManager.toggleRestDay(dateStr);
    } else {
        // 后备方案：如果RestDayManager未加载，使用原有逻辑
        console.log('toggleRestDay: 函数开始执行, dateStr:', dateStr);
        
        // 优先检查是否在个性化需求录入页面，如果是则允许执行
        let isInRequestList = false;
        if (typeof RequestManager !== 'undefined' && RequestManager.currentView === 'requestList') {
            console.log('toggleRestDay: 在个性化需求录入页面，允许执行');
            isInRequestList = true;
        }
        
        // 只有在不在个性化需求录入页面时，才检查是否在人员管理页面
        if (!isInRequestList) {
            if (typeof StaffManager !== 'undefined' && (StaffManager.currentView === 'configs' || StaffManager.currentView === 'staffList')) {
                console.log('toggleRestDay: 在人员管理页面，提前返回');
                return;
            }
        }
        
        // 所有日期都可以切换，包括固定假期
        console.log('toggleRestDay: 切换日期', dateStr, '的休息日状态');
        
        const isRestDay = Store.isRestDay(dateStr);
        const newState = !isRestDay;
        Store.setRestDay(dateStr, newState);
        
        // 清除所有校验结果缓存，因为休息日变化会影响所有员工的校验结果
        if (window._currentValidationResults) {
            window._currentValidationResults = {};
            console.log('toggleRestDay: 已清除所有校验结果缓存，将重新校验所有员工');
        }
        
        const isFixedHolidayFn = typeof HolidayManager !== 'undefined' ? HolidayManager.isFixedHoliday.bind(HolidayManager) : isFixedHoliday;
        const isFixed = isFixedHolidayFn(dateStr);
        console.log('toggleRestDay: 日期', dateStr, '已切换为', newState ? '休息日' : '工作日', isFixed ? '(固定假期)' : '');
        
        // 更新状态提示
        const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
        updateStatusFn(`日期 ${dateStr} 已切换为${newState ? '休息日' : '工作日'}`, 'success');
        
        // 使用增量更新而不是完全重新渲染
        const updateRestDayCellFn = typeof RestDayManager !== 'undefined' ? RestDayManager.updateRestDayCell.bind(RestDayManager) : updateRestDayCell;
        updateRestDayCellFn(dateStr, newState);
        
        console.log('toggleRestDay: 函数执行完成');
    }
}

// 将函数暴露到全局作用域，以便onclick事件可以调用
if (typeof window !== 'undefined') {
    window.toggleRestDay = toggleRestDay;
}

/**
 * 判断某个日期是否是固定假期（不可更改的）
 * @param {string} dateStr - 日期字符串（YYYY-MM-DD格式）
 * @returns {boolean} 是否是固定假期
 * @deprecated 已提取到 HolidayManager.isFixedHoliday，保留此函数用于向后兼容
 */
function isFixedHoliday(dateStr) {
    // 优先使用 HolidayManager
    if (typeof HolidayManager !== 'undefined' && HolidayManager.isFixedHoliday) {
        return HolidayManager.isFixedHoliday(dateStr);
    }
    
    // 后备方案：如果HolidayManager未加载，使用原有逻辑
    const date = new Date(dateStr);
    const month = date.getMonth() + 1; // 0-11 -> 1-12
    const day = date.getDate();
    const year = date.getFullYear();
    
    // 0101（元旦）
    if (month === 1 && day === 1) {
        return true;
    }
    
    // 0501-0503（劳动节）
    if (month === 5 && day >= 1 && day <= 3) {
        return true;
    }
    
    // 1001-1003（国庆节）
    if (month === 10 && day >= 1 && day <= 3) {
        return true;
    }
    
    // 获取节假日信息
    const getHolidaysFn = typeof HolidayManager !== 'undefined' ? HolidayManager.getHolidays.bind(HolidayManager) : getHolidays;
    const holidays = getHolidaysFn(year);
    const holidayName = holidays[dateStr];
    
    // 清明、端午、中秋当天
    if (holidayName === '清明' || holidayName === '端午' || holidayName === '中秋') {
        return true;
    }
    
    // 春节第一天及其后2天（共3天）
    // 需要找到春节的第一天
    const springFestivalDates = Object.keys(holidays).filter(d => holidays[d] === '春节').sort();
    if (springFestivalDates.length > 0) {
        const firstDay = springFestivalDates[0];
        const firstDate = new Date(firstDay);
        const currentDate = new Date(dateStr);
        const diffDays = Math.floor((currentDate - firstDate) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 2) {
            return true;
        }
    }
    
    return false;
}

// 将函数暴露到全局作用域，以便其他模块使用
if (typeof window !== 'undefined') {
    window.isFixedHoliday = isFixedHoliday;
}

/**
 * 获取指定年份的法定节假日
 * @param {number} year - 年份
 * @returns {Object} 节假日对象 { "YYYY-MM-DD": "节假日名称", ... }
 * @deprecated 已提取到 HolidayManager.getHolidays，保留此函数用于向后兼容
 */
function getHolidays(year) {
    // 优先使用 HolidayManager
    if (typeof HolidayManager !== 'undefined' && HolidayManager.getHolidays) {
        return HolidayManager.getHolidays(year);
    }
    
    // 后备方案：如果HolidayManager未加载，使用原有逻辑
    const holidays = {};
    
    // 元旦：1月1日（固定）
    holidays[`${year}-01-01`] = '元旦';
    
    // 春节：农历正月初一（公历日期）
    // 2025年春节：1月28日-2月3日（7天假期）
    // 2026年春节：2月16日-2月22日（7天假期）
    // 2027年春节：2月5日-2月11日（7天假期）
    if (year === 2025) {
        holidays['2025-01-28'] = '春节';
        holidays['2025-01-29'] = '春节';
        holidays['2025-01-30'] = '春节';
        holidays['2025-01-31'] = '春节';
        holidays['2025-02-01'] = '春节';
        holidays['2025-02-02'] = '春节';
        holidays['2025-02-03'] = '春节';
    } else if (year === 2026) {
        holidays['2026-02-16'] = '春节';
        holidays['2026-02-17'] = '春节';
        holidays['2026-02-18'] = '春节';
        holidays['2026-02-19'] = '春节';
        holidays['2026-02-20'] = '春节';
        holidays['2026-02-21'] = '春节';
        holidays['2026-02-22'] = '春节';
    } else if (year === 2027) {
        holidays['2027-02-05'] = '春节';
        holidays['2027-02-06'] = '春节';
        holidays['2027-02-07'] = '春节';
        holidays['2027-02-08'] = '春节';
        holidays['2027-02-09'] = '春节';
        holidays['2027-02-10'] = '春节';
        holidays['2027-02-11'] = '春节';
    }
    
    // 清明：4月4日或4月5日（根据年份不同）
    // 2025年：4月5日，2026年：4月4日，2027年：4月5日
    if (year === 2025 || year === 2027) {
        holidays[`${year}-04-05`] = '清明';
    } else if (year === 2026) {
        holidays['2026-04-04'] = '清明';
    }
    
    // 五一：5月1日（固定）
    holidays[`${year}-05-01`] = '五一';
    
    // 端午：农历五月初五（公历日期）
    // 2025年端午：5月31日
    // 2026年端午：6月19日
    // 2027年端午：6月9日
    if (year === 2025) {
        holidays['2025-05-31'] = '端午';
    } else if (year === 2026) {
        holidays['2026-06-19'] = '端午';
    } else if (year === 2027) {
        holidays['2027-06-09'] = '端午';
    }
    
    // 中秋：农历八月十五（公历日期）
    // 2025年中秋：10月6日
    // 2026年中秋：9月25日
    // 2027年中秋：10月4日
    if (year === 2025) {
        holidays['2025-10-06'] = '中秋';
    } else if (year === 2026) {
        holidays['2026-09-25'] = '中秋';
    } else if (year === 2027) {
        holidays['2027-10-04'] = '中秋';
    }
    
    // 国庆：10月1日-10月7日（固定，7天假期）
    for (let day = 1; day <= 7; day++) {
        holidays[`${year}-10-${String(day).padStart(2, '0')}`] = '国庆';
    }
    
    return holidays;
}

/**
 * 切换个人休假需求
 * @param {string} staffId - 人员ID
 * @param {string} dateStr - 日期（YYYY-MM-DD格式）
 */
async function togglePersonalRequest(staffId, dateStr) {
    console.log('togglePersonalRequest: 函数开始执行, staffId:', staffId, 'dateStr:', dateStr);
    
    // 优先检查是否在个性化需求录入页面，如果是则允许执行
    let isInRequestList = false;
    if (typeof RequestManager !== 'undefined' && RequestManager.currentView === 'requestList') {
        console.log('togglePersonalRequest: 在个性化需求录入页面，允许执行');
        isInRequestList = true;
    }
    
    // 只有在不在个性化需求录入页面时，才检查是否在人员管理页面
    if (!isInRequestList) {
        if (typeof StaffManager !== 'undefined' && (StaffManager.currentView === 'configs' || StaffManager.currentView === 'staffList')) {
            console.log('togglePersonalRequest: 在人员管理页面，提前返回');
            return;
        }
    }
    
    console.log('togglePersonalRequest: 切换人员', staffId, '日期', dateStr, '的休假需求');
    
    const currentRequests = Store.getPersonalRequests(staffId);
    const currentStatus = currentRequests[dateStr];
    
    // 切换状态：空 -> REQ -> 空
    let newStatus = '';
    if (currentStatus !== 'REQ') {
        newStatus = 'REQ';
    }
    
    console.log('togglePersonalRequest: 状态从', currentStatus, '切换为', newStatus || '空');
    
    // 更新状态
    Store.setPersonalRequest(staffId, dateStr, newStatus);
    
    // 清除校验结果缓存，强制重新校验
    if (window._currentValidationResults) {
        delete window._currentValidationResults[staffId];
        console.log('togglePersonalRequest: 已清除该员工的校验结果缓存，将重新校验');
    }
    
    // 验证状态是否已更新
    const updatedRequests = Store.getPersonalRequests(staffId);
    const updatedStatus = updatedRequests[dateStr];
    console.log('togglePersonalRequest: 状态更新后验证 - staffId:', staffId, 'dateStr:', dateStr, 'status:', updatedStatus);
    
    // 获取人员信息用于提示
    const staffData = Store.getCurrentStaffData();
    const staff = staffData.find(s => (s.staffId || s.id) === staffId);
    const staffName = staff ? staff.name : staffId;
    
    // 更新状态提示
    const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
    updateStatusFn(`${staffName} ${dateStr} ${newStatus ? '已申请休假' : '已取消休假'}`, 'success');
    
    // 使用增量更新而不是完全重新渲染
    updatePersonalRequestCell(staffId, dateStr, newStatus);
    
    console.log('togglePersonalRequest: 函数执行完成');
}

/**
 * 增量更新单个人员休假单元格
 * @param {string} staffId - 人员ID
 * @param {string} dateStr - 日期
 * @param {string} status - 新状态（'REQ' 或 ''）
 */
function updatePersonalRequestCell(staffId, dateStr, status) {
    // 查找对应的单元格
    const cell = document.querySelector(`td[data-staff-id="${staffId}"][data-date="${dateStr}"][data-personal-request-cell="true"]`);
    if (!cell) {
        console.warn('updatePersonalRequestCell: 未找到单元格，使用完整重新渲染');
        _isUpdatingStaffDisplay = false;
        updateStaffDisplay();
        return;
    }
    
    const isRequested = status === 'REQ';
    const isRestDay = Store.isRestDay(dateStr);
    const isFixedHolidayFn = typeof HolidayManager !== 'undefined' ? HolidayManager.isFixedHoliday.bind(HolidayManager) : isFixedHoliday;
    const isFixed = isFixedHolidayFn(dateStr);
    
    // 更新单元格样式和内容
    let cellClass = 'bg-white hover:bg-gray-100';
    let displayText = '';
    
    if (isRequested) {
        // 有休假需求
        if (isFixed || isRestDay) {
            // 假期休假：红色背景，白色文字
            cellClass = 'bg-red-500 hover:bg-red-600 text-white font-semibold';
            displayText = '休';
        } else {
            // 普通休假：蓝色背景，白色文字
            cellClass = 'bg-blue-500 hover:bg-blue-600 text-white font-semibold';
            displayText = '休';
        }
    } else {
        // 无休假需求
        cellClass = 'bg-white hover:bg-gray-100';
        displayText = '';
    }
    
    // 更新单元格
    cell.className = `px-0.5 py-1 text-center text-xs border border-gray-300 cursor-pointer ${cellClass} transition-colors`;
    cell.textContent = displayText;
    cell.title = isRequested ? (isFixed || isRestDay ? '假期休假' : '普通休假') : '点击申请休假';
    
    // 更新错误指示器（如果需要）
    const row = cell.closest('tr');
    if (row) {
        const staffIdFromRow = row.getAttribute('data-staff-id');
        if (staffIdFromRow) {
            // 清除校验结果缓存，触发重新校验
            if (window._currentValidationResults) {
                delete window._currentValidationResults[staffIdFromRow];
            }
            
            // 异步重新校验并更新错误指示器
            setTimeout(async () => {
                try {
                    const scheduleConfig = Store.getState('scheduleConfig');
                    const allPersonalRequests = Store.getAllPersonalRequests();
                    const results = await Validators.validateAllPersonalRequests(allPersonalRequests, scheduleConfig);
                    window._currentValidationResults = results;
                    
                    // 更新错误指示器
                    const errorCell = row.querySelector('td:first-child');
                    const validation = results[staffIdFromRow] || { isValid: true, errors: [] };
                    const hasError = !validation.isValid;
                    const errorTooltip = hasError ? validation.errors.join('；') : '';
                    
                    if (errorCell) {
                        if (hasError) {
                            errorCell.innerHTML = `
                                <span class="inline-block w-4 h-4 bg-red-500 rounded-full cursor-help" 
                                      title="${errorTooltip}"
                                      style="position: relative;">
                                    <span class="absolute inset-0 flex items-center justify-center text-white text-[10px]">!</span>
                                </span>
                            `;
                        } else {
                            errorCell.innerHTML = '<span class="inline-block w-4 h-4"></span>';
                        }
                    }
                } catch (error) {
                    console.error('重新校验失败:', error);
                }
            }, 100);
        }
    }
    
    console.log('updatePersonalRequestCell: 单元格已更新', { staffId, dateStr, status });
}

/**
 * 增量更新休息日单元格
 * @param {string} dateStr - 日期
 * @param {boolean} isRestDay - 是否为休息日
 * @deprecated 已提取到 RestDayManager.updateRestDayCell，保留此函数用于向后兼容
 */
function updateRestDayCell(dateStr, isRestDay) {
    // 优先使用 RestDayManager
    if (typeof RestDayManager !== 'undefined' && RestDayManager.updateRestDayCell) {
        RestDayManager.updateRestDayCell(dateStr, isRestDay);
        return;
    }
    
    // 后备方案：如果RestDayManager未加载，使用原有逻辑
    // 查找对应的单元格
    const cell = document.querySelector(`td[data-date="${dateStr}"][data-rest-day-cell="true"]`);
    if (!cell) {
        console.warn('updateRestDayCell: 未找到单元格，使用完整重新渲染');
        _isUpdatingStaffDisplay = false;
        updateStaffDisplay();
        return;
    }
    
    const isFixedHolidayFn = typeof HolidayManager !== 'undefined' ? HolidayManager.isFixedHoliday.bind(HolidayManager) : isFixedHoliday;
    const isFixed = isFixedHolidayFn(dateStr);
    
    // 更新单元格样式和内容
    let restDayClass, titleText;
    
    if (isFixed && isRestDay) {
        // 固定假期且是休息日：红色背景
        restDayClass = 'bg-red-500 hover:bg-red-600 text-white';
        titleText = `固定假期（${isRestDay ? '休息日' : '工作日'}），点击切换`;
    } else if (isRestDay) {
        // 可更改的休息日：蓝色背景
        restDayClass = 'bg-blue-400 hover:bg-blue-500 text-white';
        titleText = `休息日，点击切换为工作日`;
    } else {
        // 工作日：灰色背景
        restDayClass = 'bg-gray-100 hover:bg-gray-200 text-gray-700';
        titleText = `工作日，点击切换为休息日`;
    }
    
    // 更新单元格
    cell.className = `px-0.5 py-1 text-center text-xs border border-gray-300 cursor-pointer ${restDayClass} transition-colors font-semibold`;
    cell.textContent = isRestDay ? '休' : '班';
    cell.title = titleText;
    
    // 更新所有人员行的对应日期单元格（如果该日期是休息日，可能需要更新样式）
    const allCells = document.querySelectorAll(`td[data-date="${dateStr}"][data-personal-request-cell="true"]`);
    allCells.forEach(cell => {
        const isRequested = cell.textContent.trim() === '休';
        if (isRequested && (isFixed || isRestDay)) {
            // 如果是假期休假，更新为红色
            cell.className = 'px-0.5 py-1 text-center text-xs border border-gray-300 cursor-pointer bg-red-500 hover:bg-red-600 text-white font-semibold transition-colors';
            cell.title = '假期休假';
        } else if (isRequested && !isRestDay) {
            // 如果是普通休假，更新为蓝色
            cell.className = 'px-0.5 py-1 text-center text-xs border border-gray-300 cursor-pointer bg-blue-500 hover:bg-blue-600 text-white font-semibold transition-colors';
            cell.title = '普通休假';
        }
    });
    
    console.log('updateRestDayCell: 单元格已更新', { dateStr, isRestDay });
    
    // 触发重新校验（因为休息日变化会影响校验结果）
    setTimeout(async () => {
        try {
            const scheduleConfig = Store.getState('scheduleConfig');
            const allPersonalRequests = Store.getAllPersonalRequests();
            const results = await Validators.validateAllPersonalRequests(allPersonalRequests, scheduleConfig);
            window._currentValidationResults = results;
            
            // 更新所有行的错误指示器
            const scheduleTable = document.getElementById('scheduleTable');
            if (scheduleTable) {
                const rows = scheduleTable.querySelectorAll('tbody tr[data-staff-id]');
                rows.forEach(row => {
                    const staffId = row.getAttribute('data-staff-id');
                    const validation = results[staffId] || { isValid: true, errors: [] };
                    const hasError = !validation.isValid;
                    const errorTooltip = hasError ? validation.errors.join('；') : '';
                    
                    const errorCell = row.querySelector('td:first-child');
                    if (errorCell) {
                        if (hasError) {
                            errorCell.innerHTML = `
                                <span class="inline-block w-4 h-4 bg-red-500 rounded-full cursor-help" 
                                      title="${errorTooltip}"
                                      style="position: relative;">
                                    <span class="absolute inset-0 flex items-center justify-center text-white text-[10px]">!</span>
                                </span>
                            `;
                        } else {
                            errorCell.innerHTML = '<span class="inline-block w-4 h-4"></span>';
                        }
                    }
                });
            }
        } catch (error) {
            console.error('重新校验失败:', error);
        }
    }, 100);
}

// 将函数暴露到全局作用域，以便onclick事件可以调用
if (typeof window !== 'undefined') {
    window.togglePersonalRequest = togglePersonalRequest;
}

/**
 * 清空人员数据显示
 */
function clearStaffDisplay() {
    const scheduleTable = document.getElementById('scheduleTable');
    if (scheduleTable) {
        scheduleTable.innerHTML = `
            <div class="p-8 text-center text-gray-400">
                <p>请先上传数据并配置日期范围</p>
            </div>
        `;
    }
}


/**
 * 更新状态提示
 * @deprecated 已提取到 StatusUtils.updateStatus，保留此函数用于向后兼容
 */
function updateStatus(message, type = 'info') {
    // 优先使用 StatusUtils
    if (typeof StatusUtils !== 'undefined' && StatusUtils.updateStatus) {
        StatusUtils.updateStatus(message, type);
        return;
    }
    
    // 后备方案：如果StatusUtils未加载，使用原有逻辑
    const statusText = document.getElementById('statusText');
    if (statusText) {
        statusText.textContent = message;
        statusText.className = `text-sm font-medium ${
            type === 'success' ? 'text-green-600' : 
            type === 'error' ? 'text-red-600' : 
            'text-gray-800'
        }`;
    }
}

/**
 * 格式化日期为 YYYY-MM-DD
 * @deprecated 已提取到 DateUtils.formatDate，保留此函数用于向后兼容
 */
function formatDate(date) {
    // 优先使用 DateUtils
    if (typeof DateUtils !== 'undefined' && DateUtils.formatDate) {
        return DateUtils.formatDate(date);
    }
    
    // 后备方案：如果DateUtils未加载，使用原有逻辑
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 自定义输入对话框（替代 prompt()）
 * @param {string} message - 提示信息
 * @param {string} defaultValue - 默认值
 * @returns {Promise<string|null>} 用户输入的值，取消时返回 null
 * @deprecated 已提取到 DialogUtils.showInputDialog，保留此函数用于向后兼容
 */
function showInputDialog(message, defaultValue = '') {
    // 优先使用 DialogUtils
    if (typeof DialogUtils !== 'undefined' && DialogUtils.showInputDialog) {
        return DialogUtils.showInputDialog(message, defaultValue);
    }
    
    // 后备方案：如果DialogUtils未加载，使用原有逻辑
    return new Promise((resolve) => {
        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        // 创建对话框
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white;
            border-radius: 8px;
            padding: 24px;
            min-width: 400px;
            max-width: 600px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        `;

        // 创建内容
        dialog.innerHTML = `
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">
                    ${message}
                </label>
                <input type="text" id="inputDialogInput" 
                       value="${defaultValue.replace(/"/g, '&quot;')}" 
                       style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; box-sizing: border-box;"
                       autofocus>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 8px;">
                <button id="inputDialogCancel" 
                        style="padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
                    取消
                </button>
                <button id="inputDialogConfirm" 
                        style="padding: 8px 16px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
                    确定
                </button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const input = dialog.querySelector('#inputDialogInput');
        const confirmBtn = dialog.querySelector('#inputDialogConfirm');
        const cancelBtn = dialog.querySelector('#inputDialogCancel');

        // 确认按钮
        const handleConfirm = () => {
            const value = input.value.trim();
            document.body.removeChild(overlay);
            resolve(value || null);
        };

        // 取消按钮
        const handleCancel = () => {
            document.body.removeChild(overlay);
            resolve(null);
        };

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);

        // 按 Enter 确认，按 Esc 取消
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirm();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
            }
        });

        // 点击遮罩层关闭
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                handleCancel();
            }
        });

        // 聚焦输入框
        setTimeout(() => {
            input.focus();
            input.select();
        }, 100);
    });
}

// 确保 showInputDialog 在全局作用域可用
if (typeof window !== 'undefined') {
    window.showInputDialog = showInputDialog;
}

/**
 * 应用人员筛选
 * @deprecated 已提取到 StaffFilter，保留此函数用于向后兼容
 */
function applyStaffFilter() {
    // 优先使用 StaffFilter
    if (typeof StaffFilter !== 'undefined' && StaffFilter.updateFilterStateFromDOM) {
        StaffFilter.updateFilterStateFromDOM();
        // 重新渲染表格
        console.log('updateStaffDisplay: 开始执行');
        _isUpdatingStaffDisplay = false;
        updateStaffDisplay();
        return;
    }
    
    // 后备方案：如果StaffFilter未加载，使用原有逻辑
    if (!window._staffFilterState) {
        const allPersonTypes = ['全人力侦测', '半人力授权+侦测', '全人力授权+大夜侦测', '授权人员支援侦测+大夜授权'];
        const allLocations = ['上海', '成都'];
        window._staffFilterState = {
            personTypes: allPersonTypes,
            locations: allLocations,
            idFilter: '',
            nameFilter: ''
        };
    }
    
    const filterState = window._staffFilterState;
    
    // 获取筛选条件
    const idInput = document.getElementById('filterId');
    const nameInput = document.getElementById('filterName');
    
    if (idInput) {
        filterState.idFilter = idInput.value || '';
    }
    if (nameInput) {
        filterState.nameFilter = nameInput.value || '';
    }
    
    // 人员类型和归属地通过复选框更新，不需要从DOM读取
    
    // 重新渲染表格
    console.log('updateStaffDisplay: 开始执行');
    _isUpdatingStaffDisplay = false;
    updateStaffDisplay();
}

/**
 * 清除人员筛选
 * @deprecated 已提取到 StaffFilter，保留此函数用于向后兼容
 */
function clearStaffFilter() {
    // 优先使用 StaffFilter
    if (typeof StaffFilter !== 'undefined' && StaffFilter.clearFilter) {
        StaffFilter.clearFilter();
        // 重新渲染表格
        console.log('updateStaffDisplay: 开始执行');
        _isUpdatingStaffDisplay = false;
        updateStaffDisplay();
        return;
    }
    
    // 后备方案：如果StaffFilter未加载，使用原有逻辑
    // 重置为默认全部勾选
    const allPersonTypes = ['全人力侦测', '半人力授权+侦测', '全人力授权+大夜侦测', '授权人员支援侦测+大夜授权'];
    const allLocations = ['上海', '成都'];
    
    if (!window._staffFilterState) {
        window._staffFilterState = {
            personTypes: allPersonTypes,
            locations: allLocations,
            idFilter: '',
            nameFilter: ''
        };
    } else {
        window._staffFilterState.personTypes = allPersonTypes;
        window._staffFilterState.locations = allLocations;
        window._staffFilterState.idFilter = '';
        window._staffFilterState.nameFilter = '';
    }
    
    // 重新渲染表格
    console.log('updateStaffDisplay: 开始执行');
    _isUpdatingStaffDisplay = false;
    updateStaffDisplay();
}

/**
 * 切换归属地下拉列表显示
 */
function toggleLocationFilterDropdown() {
    const dropdown = document.getElementById('filterLocationDropdown');
    const personTypeDropdown = document.getElementById('filterPersonTypeDropdown');
    if (dropdown) {
        // 关闭人员类型下拉列表
        if (personTypeDropdown) {
            personTypeDropdown.classList.add('hidden');
        }
        // 切换归属地下拉列表
        dropdown.classList.toggle('hidden');
    }
}

/**
 * 切换人员类型下拉列表显示
 */
function togglePersonTypeFilterDropdown() {
    const dropdown = document.getElementById('filterPersonTypeDropdown');
    const locationDropdown = document.getElementById('filterLocationDropdown');
    if (dropdown) {
        // 关闭归属地下拉列表
        if (locationDropdown) {
            locationDropdown.classList.add('hidden');
        }
        // 切换人员类型下拉列表
        dropdown.classList.toggle('hidden');
    }
}

/**
 * 切换归属地全部选择
 */
function toggleLocationFilterAll(checkbox) {
    const shanghai = document.getElementById('filterLocationShanghai');
    const chengdu = document.getElementById('filterLocationChengdu');
    
    if (checkbox.checked) {
        // 全部勾选
        if (shanghai) shanghai.checked = true;
        if (chengdu) chengdu.checked = true;
    } else {
        // 全部取消（但至少保留一个）
        if (shanghai) shanghai.checked = true;
        if (chengdu) chengdu.checked = false;
    }
    updateLocationFilter();
}

/**
 * 更新归属地筛选
 */
function updateLocationFilter() {
    if (!window._staffFilterState) {
        window._staffFilterState = {
            personTypes: ['全人力侦测', '半人力授权+侦测', '全人力授权+大夜侦测', '授权人员支援侦测+大夜授权'],
            locations: ['上海', '成都'],
            idFilter: '',
            nameFilter: ''
        };
    }
    
    const shanghai = document.getElementById('filterLocationShanghai');
    const chengdu = document.getElementById('filterLocationChengdu');
    const all = document.getElementById('filterLocationAll');
    const display = document.getElementById('filterLocationDisplay');
    
    const selected = [];
    if (shanghai && shanghai.checked) selected.push('上海');
    if (chengdu && chengdu.checked) selected.push('成都');
    
    // 更新全部复选框状态
    if (all) {
        all.checked = selected.length === 2;
    }
    
    // 更新显示
    if (display) {
        display.value = selected.length === 2 ? '全部' : selected.join(', ');
    }
    
    // 更新筛选状态
    window._staffFilterState.locations = selected;
}

/**
 * 切换人员类型全部选择
 */
function togglePersonTypeFilterAll(checkbox) {
    const type1 = document.getElementById('filterPersonType1');
    const type2 = document.getElementById('filterPersonType2');
    const type3 = document.getElementById('filterPersonType3');
    const type4 = document.getElementById('filterPersonType4');
    
    if (checkbox.checked) {
        // 全部勾选
        if (type1) type1.checked = true;
        if (type2) type2.checked = true;
        if (type3) type3.checked = true;
        if (type4) type4.checked = true;
    } else {
        // 全部取消（但至少保留一个）
        if (type1) type1.checked = true;
        if (type2) type2.checked = false;
        if (type3) type3.checked = false;
        if (type4) type4.checked = false;
    }
    updatePersonTypeFilter();
}

/**
 * 更新人员类型筛选
 */
function updatePersonTypeFilter() {
    if (!window._staffFilterState) {
        window._staffFilterState = {
            personTypes: ['全人力侦测', '半人力授权+侦测', '全人力授权+大夜侦测', '授权人员支援侦测+大夜授权'],
            locations: ['上海', '成都'],
            idFilter: '',
            nameFilter: ''
        };
    }
    
    const type1 = document.getElementById('filterPersonType1');
    const type2 = document.getElementById('filterPersonType2');
    const type3 = document.getElementById('filterPersonType3');
    const type4 = document.getElementById('filterPersonType4');
    const all = document.getElementById('filterPersonTypeAll');
    const display = document.getElementById('filterPersonTypeDisplay');
    
    const selected = [];
    if (type1 && type1.checked) selected.push('全人力侦测');
    if (type2 && type2.checked) selected.push('半人力授权+侦测');
    if (type3 && type3.checked) selected.push('全人力授权+大夜侦测');
    if (type4 && type4.checked) selected.push('授权人员支援侦测+大夜授权');
    
    // 更新全部复选框状态
    if (all) {
        all.checked = selected.length === 4;
    }
    
    // 更新显示
    if (display) {
        display.value = selected.length === 4 ? '全部' : selected.join(', ');
    }
    
    // 更新筛选状态
    window._staffFilterState.personTypes = selected;
}

// 点击页面其他地方时关闭下拉列表
document.addEventListener('click', (e) => {
    const locationDropdown = document.getElementById('filterLocationDropdown');
    const personTypeDropdown = document.getElementById('filterPersonTypeDropdown');
    const locationDisplay = document.getElementById('filterLocationDisplay');
    const personTypeDisplay = document.getElementById('filterPersonTypeDisplay');
    
    // 如果点击的不是下拉列表相关元素，则关闭下拉列表
    if (locationDropdown && !locationDropdown.contains(e.target) && 
        locationDisplay && !locationDisplay.contains(e.target)) {
        locationDropdown.classList.add('hidden');
    }
    
    if (personTypeDropdown && !personTypeDropdown.contains(e.target) && 
        personTypeDisplay && !personTypeDisplay.contains(e.target)) {
        personTypeDropdown.classList.add('hidden');
    }
    
    // 如果点击的是页面其他地方，触发筛选更新
    if (locationDropdown && !locationDropdown.contains(e.target) && 
        personTypeDropdown && !personTypeDropdown.contains(e.target) &&
        locationDisplay && !locationDisplay.contains(e.target) &&
        personTypeDisplay && !personTypeDisplay.contains(e.target)) {
        // 检查是否有筛选条件变化，如果有则更新
        const idInput = document.getElementById('filterId');
        const nameInput = document.getElementById('filterName');
        if (idInput && document.activeElement === idInput) return;
        if (nameInput && document.activeElement === nameInput) return;
        
        // 延迟执行，确保下拉列表已关闭
        setTimeout(() => {
            applyStaffFilter();
        }, 100);
    }
});

// 确保筛选函数在全局作用域可用
if (typeof window !== 'undefined') {
    window.applyStaffFilter = applyStaffFilter;
    window.clearStaffFilter = clearStaffFilter;
    window.toggleLocationFilterDropdown = toggleLocationFilterDropdown;
    window.togglePersonTypeFilterDropdown = togglePersonTypeFilterDropdown;
    window.toggleLocationFilterAll = toggleLocationFilterAll;
    window.togglePersonTypeFilterAll = togglePersonTypeFilterAll;
    window.updateLocationFilter = updateLocationFilter;
    window.updatePersonTypeFilter = updatePersonTypeFilter;
}

/**
 * 处理批量上传个性化需求
 */
async function handleUploadPersonalRequests() {
    // 创建隐藏的文件输入框
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx,.xls,.csv';
    fileInput.style.display = 'none';
    
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) {
            document.body.removeChild(fileInput);
            return;
        }

        try {
            const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
            updateStatusFn('正在处理文件...', 'info');
            await DataLoader.processPersonalRequestsFile(file);
            updateStaffDisplay();
            updateStatusFn('需求导入成功', 'success');
        } catch (error) {
            console.error('文件处理失败:', error);
            const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
            updateStatusFn('文件处理失败：' + error.message, 'error');
            alert('文件处理失败：' + error.message);
        } finally {
            document.body.removeChild(fileInput);
        }
    });
    
    document.body.appendChild(fileInput);
    fileInput.click();
}

/**
 * 处理导出个性化需求
 */
function handleExportPersonalRequests() {
    const allPersonalRequests = Store.getAllPersonalRequests();
    const allRestDays = Store.getAllRestDays();
    const scheduleConfig = Store.getState('scheduleConfig');
    const staffData = Store.getCurrentStaffData();
    
    if (!scheduleConfig.startDate || !scheduleConfig.endDate) {
        alert('请先配置排班周期');
        return;
    }
    
    if (!staffData || staffData.length === 0) {
        alert('请先上传人员数据');
        return;
    }
    
    try {
        // 生成日期列表
        const dateList = generateDateList(scheduleConfig.startDate, scheduleConfig.endDate);
        
        // 准备导出数据
        const headers = ['ID', '姓名', ...dateList.map(d => d.dateStr)];
        const data = [];
        
        // 添加法定休息日行
        const restDayRow = ['法定休息日', '', ...dateList.map(d => allRestDays[d.dateStr] ? '休' : '')];
        data.push(restDayRow);
        
        // 添加人员行
        staffData.forEach(staff => {
            const staffId = staff.staffId || staff.id;
            const requests = allPersonalRequests[staffId] || {};
            const row = [
                staff.id || '',
                staff.name || '',
                ...dateList.map(d => requests[d.dateStr] === 'REQ' ? 'REQ' : '')
            ];
            data.push(row);
        });
        
        // 创建工作表
        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
        
        // 设置列宽
        const colWidths = [
            { wch: 10 }, // ID
            { wch: 12 }, // 姓名
            ...dateList.map(() => ({ wch: 12 })) // 日期列
        ];
        worksheet['!cols'] = colWidths;
        
        // 创建工作簿
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '个性化需求');
        
        // 获取当前配置名称（用于导出文件名）
        // 优先使用 RequestManager 中的当前配置名称
        let exportFileName = '个性化需求';
        if (typeof RequestManager !== 'undefined' && RequestManager.currentConfigId) {
            const config = Store.getRequestConfig(RequestManager.currentConfigId);
            if (config && config.name) {
                exportFileName = config.name;
            }
        }
        // 如果输入框有值且与配置名称不同，使用输入框的值（可能是用户临时修改的）
        const configNameInput = document.getElementById('requestConfigNameInput');
        if (configNameInput && configNameInput.value.trim()) {
            const inputValue = configNameInput.value.trim();
            // 如果输入框的值与配置名称不同，说明用户可能修改了名称，使用输入框的值
            if (inputValue !== exportFileName) {
                exportFileName = inputValue;
            }
        }
        
        // 检查配置名称是否已经包含日期格式
        // 配置名称格式可能是：YYYYMM-个性化休假-YYYYMMDD-HHMMSS 或 其他格式包含日期时间戳
        // 检查是否包含日期时间戳格式：-YYYYMMDD-HHMMSS 或 -YYYYMMDD 或 _YYYYMMDD
        const dateTimePattern = /-\d{8}-\d{6}$/; // 匹配 -YYYYMMDD-HHMMSS（配置名称中的格式）
        const datePattern = /[_-]\d{8}$/; // 匹配 -YYYYMMDD 或 _YYYYMMDD
        const hasDateSuffix = dateTimePattern.test(exportFileName) || datePattern.test(exportFileName);
        
        // 导出
        let fileName;
        if (hasDateSuffix) {
            // 如果已经包含日期后缀，直接使用配置名称，不添加额外的日期后缀
            fileName = `${exportFileName}.xlsx`;
        } else {
            // 如果没有日期后缀，添加日期后缀
            const now = new Date();
            fileName = `${exportFileName}_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`;
        }
        XLSX.writeFile(workbook, fileName);
        
        const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
        updateStatusFn('需求已导出', 'success');
    } catch (error) {
        console.error('导出失败:', error);
        alert('导出失败：' + error.message);
    }
}

/**
 * 当排班周期改变时，更新个性化休假配置名称（临时更新，不保存）
 * @param {number} year - 年份
 * @param {number} month - 月份
 */
async function updateRequestConfigNameOnScheduleChange(year, month) {
    try {
        if (typeof RequestManager === 'undefined' || !RequestManager.currentConfigId) {
            return;
        }
        
        const currentConfigId = RequestManager.currentConfigId;
        const currentConfig = Store.getRequestConfig(currentConfigId);
        
        if (!currentConfig) {
            return;
        }
        
        // 保存原始配置名称和排班周期（如果还没有保存）
        if (!RequestManager.originalConfigName) {
            RequestManager.originalConfigName = currentConfig.name;
        }
        if (!RequestManager.originalScheduleConfig) {
            RequestManager.originalScheduleConfig = currentConfig.scheduleConfig 
                ? JSON.parse(JSON.stringify(currentConfig.scheduleConfig))
                : null;
        }
        
        // 获取原始排班周期的年月
        const originalYear = RequestManager.originalScheduleConfig ? RequestManager.originalScheduleConfig.year : null;
        const originalMonth = RequestManager.originalScheduleConfig ? RequestManager.originalScheduleConfig.month : null;
        
        // 生成新配置名称：YYYYMM-原配置名称
        const yearMonthPrefix = `${year}${String(month).padStart(2, '0')}`;
        const originalName = RequestManager.originalConfigName || currentConfig.name || '未命名配置';
        
        // 如果原名称已经包含YYYYMM前缀，则替换；否则添加前缀
        const nameMatch = originalName.match(/^(\d{6})[-_](.+)$/);
        let newName;
        if (nameMatch) {
            // 如果原名称有前缀，替换为新前缀（使用-连接）
            newName = `${yearMonthPrefix}-${nameMatch[2]}`;
        } else {
            // 如果原名称没有前缀，添加新前缀（使用-连接）
            newName = `${yearMonthPrefix}-${originalName}`;
        }
        
        // 如果排班周期改回原来的值，恢复原配置名称
        if (originalYear === year && originalMonth === month) {
            newName = originalName;
        }
        
        // 临时更新配置名称（不保存到数据库）
        Store.updateRequestConfig(currentConfigId, {
            name: newName
        }, false); // 不自动保存
        
        // 更新界面上的配置名称显示
        const configNameInput = document.getElementById('requestConfigNameInput');
        if (configNameInput) {
            configNameInput.value = newName;
        }
        
        console.log('排班周期已更改，配置名称已临时更新:', { configId: currentConfigId, newName, year, month });
    } catch (error) {
        console.error('更新配置名称失败:', error);
    }
}

/**
 * 当排班周期改变时，更新人员配置名称（临时更新，不保存）
 * @param {number} year - 年份
 * @param {number} month - 月份
 */
async function updateStaffConfigNameOnScheduleChange(year, month) {
    try {
        if (typeof StaffManager === 'undefined' || !StaffManager.currentConfigId) {
            return;
        }
        
        const currentConfigId = StaffManager.currentConfigId;
        const currentConfig = Store.getStaffConfig(currentConfigId);
        
        if (!currentConfig) {
            return;
        }
        
        // 保存原始配置名称和排班周期（如果还没有保存）
        if (!StaffManager.originalConfigName) {
            StaffManager.originalConfigName = currentConfig.name;
        }
        if (!StaffManager.originalScheduleConfig) {
            // 从当前排班配置获取
            const scheduleConfig = Store.getState('scheduleConfig');
            StaffManager.originalScheduleConfig = scheduleConfig && scheduleConfig.year && scheduleConfig.month
                ? { year: scheduleConfig.year, month: scheduleConfig.month }
                : null;
        }
        
        // 获取原始排班周期的年月
        const originalYear = StaffManager.originalScheduleConfig ? StaffManager.originalScheduleConfig.year : null;
        const originalMonth = StaffManager.originalScheduleConfig ? StaffManager.originalScheduleConfig.month : null;
        
        // 生成新配置名称：YYYYMM-原配置名称
        const yearMonthPrefix = `${year}${String(month).padStart(2, '0')}`;
        const originalName = StaffManager.originalConfigName || currentConfig.name || '未命名配置';
        
        // 如果原名称已经包含YYYYMM前缀，则替换；否则添加前缀
        const nameMatch = originalName.match(/^(\d{6})[-_](.+)$/);
        let newName;
        if (nameMatch) {
            // 如果原名称有前缀，替换为新前缀（使用-连接）
            newName = `${yearMonthPrefix}-${nameMatch[2]}`;
        } else {
            // 如果原名称没有前缀，添加新前缀（使用-连接）
            newName = `${yearMonthPrefix}-${originalName}`;
        }
        
        // 如果排班周期改回原来的值，恢复原配置名称
        if (originalYear === year && originalMonth === month) {
            newName = originalName;
        }
        
        // 临时更新配置名称（不保存到数据库）
        Store.updateStaffConfig(currentConfigId, {
            name: newName
        }, false); // 不自动保存
        
        // 更新界面上的配置名称显示
        const configNameInput = document.querySelector('#scheduleTable input[placeholder*="配置名称"]');
        if (configNameInput) {
            configNameInput.value = newName;
        }
        
        console.log('排班周期已更改，配置名称已临时更新:', { configId: currentConfigId, newName, year, month });
    } catch (error) {
        console.error('更新配置名称失败:', error);
    }
}

/**
 * 更新需求配置名称
 */
function updateRequestConfigName() {
    const configNameInput = document.getElementById('requestConfigNameInput');
    if (!configNameInput) {
        return;
    }
    
    const newName = configNameInput.value.trim();
    if (!newName) {
        alert('配置名称不能为空');
        configNameInput.value = '未命名配置';
        return;
    }
    
    // 更新配置名称（但不保存到数据库，只有点击"配置校验并保存"时才保存）
    if (typeof RequestManager !== 'undefined' && RequestManager.currentConfigId) {
        const config = Store.getRequestConfig(RequestManager.currentConfigId);
        if (config) {
            // 只更新内存中的配置名称，不保存到数据库
            Store.updateRequestConfig(RequestManager.currentConfigId, {
                name: newName,
                updatedAt: new Date().toISOString()
            }, false); // 不自动保存
            // 注意：不调用 saveState()，避免实时保存
            const updateStatusFn = typeof StatusUtils !== 'undefined' ? StatusUtils.updateStatus.bind(StatusUtils) : updateStatus;
            updateStatusFn('配置名称已更新（将在保存时生效）', 'info');
            console.log('配置名称已更新为:', newName, '（未保存到数据库）');
        }
    } else {
        // 如果没有配置ID，只是更新显示，不保存
        console.warn('没有当前配置ID，无法保存配置名称');
    }
}

// 确保函数在全局作用域可用
if (typeof window !== 'undefined') {
    window.updateRequestConfigName = updateRequestConfigName;
}

