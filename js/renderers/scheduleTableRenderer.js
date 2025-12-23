/**
 * 排班表渲染器模块
 * 负责渲染交互式排班表，解耦了 updateStaffDisplay 的渲染逻辑
 */

const ScheduleTableRenderer = {
    /**
     * 检查是否应该渲染排班表
     * @param {Object} context - 上下文对象，包含 RequestManager 和 StaffManager
     * @returns {Object} { shouldRender: boolean, reason: string }
     */
    shouldRender(context = {}) {
        const { RequestManager, StaffManager } = context;
        
        // 优先检查是否在个性化需求子页面（requestList），如果是则允许渲染
        if (RequestManager && RequestManager.currentView === 'requestList') {
            return { shouldRender: true, reason: '在个性化需求子页面' };
        }
        
        // 在个性化需求配置列表页面，不渲染
        if (RequestManager && RequestManager.currentView === 'configs') {
            return { shouldRender: false, reason: '在个性化需求配置列表页面' };
        }
        
        // 检查是否在人员管理页面
        if (StaffManager) {
            if (StaffManager.currentView === 'configs') {
                return { shouldRender: false, reason: '在人员管理配置列表页面' };
            }
            if (StaffManager.currentView === 'staffList') {
                return { shouldRender: false, reason: '在人员管理的人员列表页面' };
            }
        }
        
        return { shouldRender: true, reason: '默认允许渲染' };
    },

    /**
     * 获取渲染所需的数据
     * @param {Object} Store - Store 对象
     * @returns {Object} { staffConfigs, allStaffData, scheduleConfig, allPersonalRequests, allRestDays }
     */
    getRenderData(Store) {
        const staffConfigs = Store.getStaffConfigs();
        const allStaffData = Store.getCurrentStaffData();
        const scheduleConfig = Store.getState('scheduleConfig');
        const allPersonalRequests = Store.getAllPersonalRequests();
        const allRestDays = Store.getAllRestDays();
        
        return {
            staffConfigs,
            allStaffData,
            scheduleConfig,
            allPersonalRequests,
            allRestDays
        };
    },

    /**
     * 生成日期列表
     * @param {string} startDateStr - 开始日期
     * @param {string} endDateStr - 结束日期
     * @param {Object} dependencies - 依赖对象 { HolidayManager, DateUtils }
     * @returns {Array} 日期信息数组
     */
    generateDateList(startDateStr, endDateStr, dependencies = {}) {
        const { HolidayManager, DateUtils } = dependencies;
        const getHolidaysFn = HolidayManager ? HolidayManager.getHolidays.bind(HolidayManager) : 
            (typeof window.getHolidays === 'function' ? window.getHolidays : () => ({}));
        const formatFn = DateUtils ? DateUtils.formatDate.bind(DateUtils) : 
            (typeof window.formatDate === 'function' ? window.formatDate : (date) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            });
        
        const dateList = [];
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);
        const currentDate = new Date(startDate);
        
        const holidays = getHolidaysFn(startDate.getFullYear());
        if (endDate.getFullYear() > startDate.getFullYear()) {
            const nextYearHolidays = getHolidaysFn(endDate.getFullYear());
            Object.assign(holidays, nextYearHolidays);
        }
        
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        while (currentDate <= endDate) {
            const dateStr = formatFn(currentDate);
            const dayOfWeek = currentDate.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const holidayName = holidays[dateStr] || '';
            const isHoliday = !!holidayName;
            
            dateList.push({
                dateStr: dateStr,
                date: new Date(currentDate),
                day: currentDate.getDate(),
                weekday: weekdays[dayOfWeek],
                isWeekend: isWeekend,
                isHoliday: isHoliday,
                holidayName: holidayName
            });
            
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        return dateList;
    },

    /**
     * 应用筛选条件
     * @param {Array} allStaffData - 所有人员数据
     * @param {Object} filterState - 筛选状态
     * @param {Object} dependencies - 依赖对象 { StaffFilter }
     * @returns {Array} 筛选后的人员数据
     */
    applyFilter(allStaffData, filterState, dependencies = {}) {
        const { StaffFilter } = dependencies;
        
        if (StaffFilter && StaffFilter.applyFilter) {
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
            return StaffFilter.applyFilter(allStaffData);
        } else {
            // 后备方案：手动筛选
            return allStaffData.filter(staff => {
                const staffId = String(staff.staffId || staff.id || '').toLowerCase();
                const staffName = String(staff.name || '').toLowerCase();
                const staffPersonType = staff.personType || '';
                const staffLocation = staff.location || '';
                
                // 人员类型筛选
                if (filterState.personTypes.length > 0) {
                    const allPersonTypes = ['全人力侦测', '半人力授权+侦测', '全人力授权+大夜侦测', '授权人员支援侦测+大夜授权'];
                    if (filterState.personTypes.length < allPersonTypes.length && !filterState.personTypes.includes(staffPersonType)) {
                        return false;
                    }
                }
                
                // 归属地筛选
                if (filterState.locations.length > 0) {
                    const allLocations = ['上海', '成都'];
                    if (filterState.locations.length < allLocations.length && !filterState.locations.includes(staffLocation)) {
                        return false;
                    }
                }
                
                // ID筛选
                if (filterState.idFilter.trim()) {
                    const idFilter = filterState.idFilter.trim().toLowerCase();
                    if (staffId !== idFilter && !staffId.includes(idFilter)) {
                        return false;
                    }
                }
                
                // 姓名筛选
                if (filterState.nameFilter.trim()) {
                    const nameFilter = filterState.nameFilter.trim().toLowerCase();
                    if (staffName !== nameFilter && !staffName.includes(nameFilter)) {
                        return false;
                    }
                }
                
                return true;
            });
        }
    },

    /**
     * 初始化筛选状态
     * @returns {Object} 筛选状态对象
     */
    initFilterState() {
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
        return window._staffFilterState;
    },

    /**
     * 渲染排班表HTML
     * @param {Object} params - 渲染参数
     * @param {Array} params.dateList - 日期列表
     * @param {Array} params.displayStaffData - 显示的人员数据
     * @param {Array} params.allStaffData - 所有人员数据
     * @param {Object} params.allPersonalRequests - 所有个人休假需求
     * @param {Object} params.allRestDays - 所有休息日
     * @param {Object} params.filterState - 筛选状态
     * @param {Object} params.validationResults - 校验结果
     * @param {string} params.currentConfigName - 当前配置名称
     * @param {Object} dependencies - 依赖对象 { Store, HolidayManager }
     * @returns {string} HTML字符串
     */
    renderHTML(params, dependencies = {}) {
        const { 
            dateList, 
            displayStaffData, 
            allStaffData, 
            allPersonalRequests, 
            allRestDays, 
            filterState, 
            validationResults,
            currentConfigName 
        } = params;
        const { Store, HolidayManager } = dependencies;
        
        const isFixedHolidayFn = HolidayManager ? HolidayManager.isFixedHoliday.bind(HolidayManager) : 
            (typeof window.isFixedHoliday === 'function' ? window.isFixedHoliday : () => false);
        const isRestDayFn = Store ? Store.isRestDay.bind(Store) : 
            (typeof window.Store !== 'undefined' && window.Store.isRestDay ? window.Store.isRestDay.bind(window.Store) : () => false);
        
        let html = `
        <div class="p-4 border-b border-gray-200 bg-white">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center space-x-2">
                    <h2 class="text-lg font-bold text-gray-800">个性化需求录入</h2>
                    <span class="text-sm text-gray-500">-</span>
                    <input type="text" 
                           id="requestConfigNameInput" 
                           value="${currentConfigName || '未命名配置'}"
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
                               value="${filterState.idFilter || ''}"
                               placeholder="输入ID进行筛选"
                               class="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                               onblur="applyStaffFilter()">
                    </div>
                    
                    <!-- 姓名筛选 -->
                    <div>
                        <label class="block text-xs font-medium text-gray-700 mb-1">姓名（模糊/精准匹配）</label>
                        <input type="text" id="filterName" 
                               value="${filterState.nameFilter || ''}"
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
                <p>说明：点击"法定休息日"行切换工作日/休息日；点击人员单元格切换休假需求（空/休）。</p>
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
            
            const bgColor = isHoliday ? 'bg-red-100' : isWeekend ? 'bg-yellow-50' : 'bg-gray-50';
            const textColor = isHoliday ? 'text-red-700' : isWeekend ? 'text-yellow-700' : 'text-gray-700';
            const borderColor = isHoliday ? 'border-red-300' : isWeekend ? 'border-yellow-200' : 'border-gray-300';
            
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
        
        // 法定休息日行
        dateList.forEach(dateInfo => {
            const dateStr = dateInfo.dateStr;
            const isRestDay = isRestDayFn(dateStr);
            const isFixed = isFixedHolidayFn(dateStr);
            
            let restDayClass, titleText;
            
            if (isFixed && isRestDay) {
                restDayClass = 'bg-red-500 hover:bg-red-600 text-white';
                titleText = `固定假期（${isRestDay ? '休息日' : '工作日'}），点击切换`;
            } else if (isRestDay) {
                restDayClass = 'bg-blue-400 hover:bg-blue-500 text-white';
                titleText = `休息日，点击切换为工作日`;
            } else {
                restDayClass = 'bg-gray-100 hover:bg-gray-200 text-gray-700';
                titleText = `工作日，点击切换为休息日`;
            }
            
            html += `
            <td class="px-0.5 py-1 text-center text-xs border border-gray-300 cursor-pointer ${restDayClass} transition-colors font-semibold"
                data-date="${dateStr}"
                data-rest-day-cell="true"
                title="${titleText}"
                style="user-select: none;">
                ${isRestDay ? '休' : '班'}
            </td>
        `;
        });
        
        html += `
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
        `;
        
        // 生成人员行
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
            
            dateList.forEach(dateInfo => {
                const dateStr = dateInfo.dateStr;
                const isRequested = personalRequests[dateStr] === 'REQ';
                const isRestDay = isRestDayFn(dateStr);
                const isFixed = isFixedHolidayFn(dateStr);
                
                let cellClass = 'bg-white hover:bg-gray-100';
                let displayText = '';
                
                if (isRequested) {
                    if (isFixed || isRestDay) {
                        cellClass = 'bg-red-500 hover:bg-red-600 text-white font-semibold';
                        displayText = '休';
                    } else {
                        cellClass = 'bg-blue-500 hover:bg-blue-600 text-white font-semibold';
                        displayText = '休';
                    }
                } else {
                    cellClass = 'bg-white hover:bg-gray-100';
                    displayText = '';
                }
                
                html += `
                <td class="px-0.5 py-1 text-center text-xs border border-gray-300 cursor-pointer ${cellClass} transition-colors"
                    data-staff-id="${staffId}"
                    data-date="${dateStr}"
                    data-personal-request-cell="true"
                    title="${isRequested ? (isFixed || isRestDay ? '假期休假' : '普通休假') : '点击申请休假'}"
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
        
        return html;
    },

    /**
     * 绑定表格事件
     * @param {HTMLElement} table - 表格元素
     * @param {Function} onRestDayClick - 休息日点击回调
     * @param {Function} onPersonalRequestClick - 个人需求点击回调
     */
    bindTableEvents(table, onRestDayClick, onPersonalRequestClick) {
        // 移除旧的事件监听器（如果存在）
        if (window._tableClickHandler) {
            table.removeEventListener('click', window._tableClickHandler, true);
        }
        
        // 创建新的事件处理器
        window._tableClickHandler = (e) => {
            const target = e.target;
            const td = target.closest('td');
            
            if (!td) {
                return;
            }
            
            const dateStr = td.getAttribute('data-date');
            const staffId = td.getAttribute('data-staff-id');
            const isRestDayCell = td.hasAttribute('data-rest-day-cell');
            const isPersonalRequestCell = td.hasAttribute('data-personal-request-cell');
            
            if (isRestDayCell && dateStr && onRestDayClick) {
                e.preventDefault();
                e.stopPropagation();
                onRestDayClick(dateStr);
                return;
            }
            
            if (isPersonalRequestCell && dateStr && staffId && onPersonalRequestClick) {
                e.preventDefault();
                e.stopPropagation();
                onPersonalRequestClick(staffId, dateStr);
                return;
            }
        };
        
        // 添加事件委托
        table.addEventListener('click', window._tableClickHandler, false);
    }
};

// 暴露到全局作用域
if (typeof window !== 'undefined') {
    window.ScheduleTableRenderer = ScheduleTableRenderer;
}

