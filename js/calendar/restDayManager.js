/**
 * 休息日管理器模块
 * 负责法定休息日的管理和切换
 */

const RestDayManager = {
    /**
     * 切换法定休息日
     * @param {string} dateStr - 日期（YYYY-MM-DD格式）
     * @returns {Promise<void>}
     */
    async toggleRestDay(dateStr) {
        console.log('RestDayManager.toggleRestDay: 函数开始执行, dateStr:', dateStr);
        
        // 优先检查是否在个性化需求录入页面，如果是则允许执行
        let isInRequestList = false;
        if (typeof RequestManager !== 'undefined' && RequestManager.currentView === 'requestList') {
            console.log('RestDayManager.toggleRestDay: 在个性化需求录入页面，允许执行');
            isInRequestList = true;
        }
        
        // 只有在不在个性化需求录入页面时，才检查是否在人员管理页面
        if (!isInRequestList) {
            if (typeof StaffManager !== 'undefined' && (StaffManager.currentView === 'configs' || StaffManager.currentView === 'staffList')) {
                console.log('RestDayManager.toggleRestDay: 在人员管理页面，提前返回');
                return;
            }
        }
        
        // 所有日期都可以切换，包括固定假期
        console.log('RestDayManager.toggleRestDay: 切换日期', dateStr, '的休息日状态');
        
        const isRestDay = Store.isRestDay(dateStr);
        const newState = !isRestDay;
        Store.setRestDay(dateStr, newState);
        
        // 清除所有校验结果缓存，因为休息日变化会影响所有员工的校验结果
        if (window._currentValidationResults) {
            window._currentValidationResults = {};
            console.log('RestDayManager.toggleRestDay: 已清除所有校验结果缓存，将重新校验所有员工');
        }
        
        const isFixed = typeof HolidayManager !== 'undefined' ? HolidayManager.isFixedHoliday(dateStr) : (typeof window.isFixedHoliday === 'function' ? window.isFixedHoliday(dateStr) : false);
        console.log('RestDayManager.toggleRestDay: 日期', dateStr, '已切换为', newState ? '休息日' : '工作日', isFixed ? '(固定假期)' : '');
        
        // 更新状态提示
        if (typeof StatusUtils !== 'undefined') {
            StatusUtils.updateStatus(`日期 ${dateStr} 已切换为${newState ? '休息日' : '工作日'}`, 'success');
        } else if (typeof window.updateStatus === 'function') {
            window.updateStatus(`日期 ${dateStr} 已切换为${newState ? '休息日' : '工作日'}`, 'success');
        }
        
        // 使用增量更新而不是完全重新渲染
        this.updateRestDayCell(dateStr, newState);
        
        console.log('RestDayManager.toggleRestDay: 函数执行完成');
    },

    /**
     * 增量更新休息日单元格
     * @param {string} dateStr - 日期
     * @param {boolean} isRestDay - 是否为休息日
     */
    updateRestDayCell(dateStr, isRestDay) {
        // 查找对应的单元格
        const cell = document.querySelector(`td[data-date="${dateStr}"][data-rest-day-cell="true"]`);
        if (!cell) {
            console.warn('RestDayManager.updateRestDayCell: 未找到单元格，使用完整重新渲染');
            // 如果找不到单元格，触发完整重新渲染（需要调用updateStaffDisplay）
            if (typeof window.updateStaffDisplay === 'function') {
                window._isUpdatingStaffDisplay = false;
                window.updateStaffDisplay();
            }
            return;
        }
        
        const isFixed = typeof HolidayManager !== 'undefined' ? HolidayManager.isFixedHoliday(dateStr) : (typeof window.isFixedHoliday === 'function' ? window.isFixedHoliday(dateStr) : false);
        
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
        
        console.log('RestDayManager.updateRestDayCell: 单元格已更新', { dateStr, isRestDay });
        
        // 触发重新校验（因为休息日变化会影响校验结果）
        setTimeout(async () => {
            try {
                const scheduleConfig = Store.getState('scheduleConfig');
                const allPersonalRequests = Store.getAllPersonalRequests();
                if (typeof Validators !== 'undefined' && Validators.validateAllPersonalRequests) {
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
                }
            } catch (error) {
                console.error('重新校验失败:', error);
            }
        }, 100);
    }
};

// 暴露到全局作用域（向后兼容）
if (typeof window !== 'undefined') {
    window.RestDayManager = RestDayManager;
    // 保持原有的toggleRestDay函数（向后兼容）
    if (typeof window.toggleRestDay === 'undefined') {
        window.toggleRestDay = RestDayManager.toggleRestDay.bind(RestDayManager);
    }
    // 保持原有的updateRestDayCell函数（向后兼容）
    if (typeof window.updateRestDayCell === 'undefined') {
        window.updateRestDayCell = RestDayManager.updateRestDayCell.bind(RestDayManager);
    }
}

