/**
 * 视图管理器模块
 * 负责视图切换和导航管理
 */

const ViewManager = {
    /**
     * 显示排班配置视图
     */
    showScheduleView() {
        const mainTitle = document.getElementById('mainTitle');
        if (mainTitle) {
            mainTitle.textContent = '排班配置';
        }
        
        this.updateNavigationButtons('schedule');
        
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
    },

    /**
     * 显示人员管理视图
     */
    showStaffManageView() {
        try {
            console.log('切换到人员管理视图');
            
            const mainTitle = document.getElementById('mainTitle');
            if (mainTitle) {
                mainTitle.textContent = '人员管理';
            }
            
            this.updateNavigationButtons('staff');
            
            // 检查StaffManager是否存在
            if (typeof StaffManager === 'undefined') {
                console.error('StaffManager未定义，请检查脚本加载顺序');
                if (typeof StatusUtils !== 'undefined') {
                    StatusUtils.updateStatus('人员管理模块未加载', 'error');
                } else if (typeof window.updateStatus === 'function') {
                    window.updateStatus('人员管理模块未加载', 'error');
                }
                alert('人员管理模块未加载，请刷新页面重试');
                return;
            }
            
            // 检查showStaffManagement方法是否存在
            if (typeof StaffManager.showStaffManagement !== 'function') {
                console.error('StaffManager.showStaffManagement方法不存在');
                if (typeof StatusUtils !== 'undefined') {
                    StatusUtils.updateStatus('人员管理方法不存在', 'error');
                } else if (typeof window.updateStatus === 'function') {
                    window.updateStatus('人员管理方法不存在', 'error');
                }
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
            
            // 更新排班周期控件的禁用状态
            if (typeof ScheduleLockManager !== 'undefined') {
                ScheduleLockManager.updateScheduleControlsState();
            }
            
            console.log('人员管理视图切换完成');
            if (typeof StatusUtils !== 'undefined') {
                StatusUtils.updateStatus('已切换到人员管理', 'success');
            } else if (typeof window.updateStatus === 'function') {
                window.updateStatus('已切换到人员管理', 'success');
            }
        } catch (error) {
            console.error('切换人员管理视图失败:', error);
            if (typeof StatusUtils !== 'undefined') {
                StatusUtils.updateStatus('切换人员管理失败：' + error.message, 'error');
            } else if (typeof window.updateStatus === 'function') {
                window.updateStatus('切换人员管理失败：' + error.message, 'error');
            }
            alert('切换人员管理失败：' + error.message + '\n\n请查看控制台获取详细信息');
        }
    },

    /**
     * 显示个性化休假视图
     */
    async showRequestManageView() {
        const mainTitle = document.getElementById('mainTitle');
        if (mainTitle) {
            mainTitle.textContent = '个性化休假';
        }
        
        this.updateNavigationButtons('request');
        
        // 简化：直接等待并检查 RequestManager（从 vacationManager.js 导出到 window.RequestManager）
        // 注意：RequestManager 不是独立文件，而是 vacationManager.js 中定义的全局对象
        console.log('showRequestManageView: 开始检查 RequestManager');
        
        // 获取 RequestManager 的辅助函数
        const getRequestManager = () => {
            if (typeof window !== 'undefined' && window.RequestManager) {
                // 检查是否有实际的方法（不只是空对象）
                if (typeof window.RequestManager.showRequestManagement === 'function') {
                    return window.RequestManager;
                }
            }
            if (typeof RequestManager !== 'undefined' && typeof RequestManager.showRequestManagement === 'function') {
                return RequestManager;
            }
            return undefined;
        };
        
        // 等待 RequestManager 加载完成（最多等待3秒）
        let RequestManagerRef = getRequestManager();
        let retryCount = 0;
        const maxRetries = 30; // 3秒
        
        while (!RequestManagerRef && retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 100));
            retryCount++;
            RequestManagerRef = getRequestManager();
            if (RequestManagerRef) {
                console.log(`showRequestManageView: RequestManager 在第 ${retryCount} 次重试后找到`);
                break;
            }
        }
        
        // 如果还是没找到，给出明确的错误提示
        if (!RequestManagerRef || typeof RequestManagerRef.showRequestManagement !== 'function') {
            console.error('RequestManager 加载失败或方法缺失');
            console.error('window.RequestManager:', window.RequestManager);
            console.error('RequestManager (全局):', typeof RequestManager !== 'undefined' ? RequestManager : 'undefined');
            console.error('脚本加载状态:', {
                requestManagerLoaded: window.requestManagerLoaded,
                requestManagerLoadError: window.requestManagerLoadError
            });
            
            alert('系统组件 (VacationManager) 加载失败。\n\n可能的原因：\n1. js/vacationManager.js 文件加载失败\n2. 脚本执行出错\n\n解决方案：\n1. 请刷新页面重试\n2. 检查浏览器控制台的错误信息\n3. 确认 js/vacationManager.js 文件存在');
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
            
            // 更新排班周期控件的禁用状态
            if (typeof ScheduleLockManager !== 'undefined') {
                ScheduleLockManager.updateScheduleControlsState();
            }
        } catch (error) {
            console.error('显示个性化休假管理页面失败:', error);
            alert('显示个性化休假管理页面失败：' + error.message);
        }
    },

    /**
     * 更新导航按钮状态
     * @param {string} activeView - 当前激活的视图：'schedule' | 'staff' | 'request'
     */
    updateNavigationButtons(activeView) {
        const btnScheduleView = document.getElementById('btnScheduleView');
        const btnStaffManageView = document.getElementById('btnStaffManageView');
        const btnRequestManageView = document.getElementById('btnRequestManageView');
        
        // 重置所有按钮
        if (btnScheduleView) {
            btnScheduleView.classList.remove('bg-blue-600', 'bg-gray-400');
            btnScheduleView.classList.add(activeView === 'schedule' ? 'bg-blue-600' : 'bg-gray-400');
        }
        if (btnStaffManageView) {
            btnStaffManageView.classList.remove('bg-purple-600', 'bg-gray-400');
            btnStaffManageView.classList.add(activeView === 'staff' ? 'bg-purple-600' : 'bg-gray-400');
        }
        if (btnRequestManageView) {
            btnRequestManageView.classList.remove('bg-purple-600', 'bg-gray-400');
            btnRequestManageView.classList.add(activeView === 'request' ? 'bg-purple-600' : 'bg-gray-400');
        }
    }
};

// 暴露到全局作用域
if (typeof window !== 'undefined') {
    window.ViewManager = ViewManager;
}

