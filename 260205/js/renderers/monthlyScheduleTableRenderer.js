/**
 * 月度班次配置表渲染器
 * 负责渲染月度班次配置的表格结构（复用样式，但功能独立）
 */

const MonthlyScheduleTableRenderer = {
    /**
     * 渲染月度班次配置表HTML
     * @param {Object} params - 渲染参数
     * @returns {string} HTML字符串
     */
    renderHTML(params) {
        const {
            dateList = [],
            displayStaffData = [],
            allStaffData = [],
            filterState = {},
            currentConfigName = '',
            expectedWorkDaysMap = {},
            shiftTypes = [],
            configId = '',
            staffScheduleData = {},
            nightShiftMap = {},
            personalRequests = {},
            restDaysMap = {},
            specialFlags = {},
            connectedToSpecial = {}
        } = params;

        const safeConfigName = currentConfigName || '未命名配置';
        const safeIdFilter = filterState.idFilter || '';
        const safeNameFilter = filterState.nameFilter || '';
        const locationDisplay = (filterState.locations && filterState.locations.length === 2)
            ? '全部'
            : (filterState.locations || []).join(', ');
        const personTypeDisplay = (filterState.personTypes && filterState.personTypes.length === 4)
            ? '全部'
            : (filterState.personTypes || []).join(', ');

        let html = `
        <div class="p-4 border-b border-gray-200 bg-white">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center space-x-2">
                    <h2 class="text-lg font-bold text-gray-800">月度班次配置</h2>
                    <span class="text-sm text-gray-500">-</span>
                    <input type="text"
                           id="monthlyScheduleConfigNameInput"
                           value="${safeConfigName}"
                           class="text-sm text-gray-500 bg-transparent border-b border-gray-300 focus:border-blue-500 focus:outline-none px-1 py-0.5"
                           style="width: 40ch;"
                           placeholder="输入配置名称"
                           onblur="MonthlyScheduleConfigManager.updateConfigName()"
                           onkeypress="if(event.key === 'Enter') { this.blur(); }">
                </div>
                <div class="flex items-center space-x-2" id="monthlyScheduleActionButtons">
                    <button onclick="MonthlyScheduleConfigManager.openConfigParams()"
                        class="px-3 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 transition-colors text-sm font-medium">
                        配置参数
                    </button>
                    <button onclick="MonthlyScheduleConfigManager.clearAllSkillsAndShifts()"
                        class="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium">
                        清空所有技能与班别
                    </button>
                    <button onclick="MonthlyScheduleConfigManager.generateMonthlyScheduleConfig()"
                        class="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">
                        生成月度班次配置
                    </button>
                    <button onclick="MonthlyScheduleConfigManager.validateAndSaveConfig()"
                        class="px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm font-medium">
                        校验并保存
                    </button>
                    <button onclick="MonthlyScheduleConfigManager.backToConfigList()"
                        class="px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium">
                        返回配置列表
                    </button>
                </div>
            </div>

            <!-- 筛选区域 -->
            <div class="bg-gray-50 p-3 rounded-lg mb-3 border border-gray-200">
                <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                        <label class="block text-xs font-medium text-gray-700 mb-1">ID（模糊/精准匹配）</label>
                        <input type="text" id="filterId"
                               value="${safeIdFilter}"
                               placeholder="输入ID进行筛选"
                               class="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                               onblur="MonthlyScheduleConfigManager.applyMonthlyScheduleFilter()">
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-700 mb-1">姓名（模糊/精准匹配）</label>
                        <input type="text" id="filterName"
                               value="${safeNameFilter}"
                               placeholder="输入姓名进行筛选"
                               class="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                               onblur="MonthlyScheduleConfigManager.applyMonthlyScheduleFilter()">
                    </div>
                    <div class="relative">
                        <label class="block text-xs font-medium text-gray-700 mb-1">归属地</label>
                        <div class="relative">
                            <input type="text" id="filterLocationDisplay"
                                   readonly disabled
                                   value="上海"
                                   placeholder="归属地"
                                   class="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs bg-gray-100 cursor-not-allowed">
                            <!-- 归属地固定为上海，不再需要筛选下拉 -->
                        </div>
                    </div>
                    <div class="relative">
                        <label class="block text-xs font-medium text-gray-700 mb-1">人员类型（多选）</label>
                        <div class="relative">
                            <input type="text" id="filterPersonTypeDisplay"
                                   readonly
                                   value="${personTypeDisplay}"
                                   placeholder="点击选择人员类型"
                                   class="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs bg-white cursor-pointer"
                                   onclick="MonthlyScheduleConfigManager.togglePersonTypeFilterDropdown()">
                            <div id="filterPersonTypeDropdown" class="hidden absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg" style="max-height: 150px; overflow-y: auto;">
                                <label class="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer">
                                    <input type="checkbox" id="filterPersonTypeAll"
                                           ${filterState.personTypes && filterState.personTypes.length === 4 ? 'checked' : ''}
                                           onchange="MonthlyScheduleConfigManager.togglePersonTypeFilterAll(this)"
                                           class="mr-2">
                                    <span class="text-xs">全部</span>
                                </label>
                                <label class="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer">
                                    <input type="checkbox" id="filterPersonType1"
                                           ${filterState.personTypes && filterState.personTypes.includes('全人力侦测') ? 'checked' : ''}
                                           onchange="MonthlyScheduleConfigManager.updatePersonTypeFilter()"
                                           class="mr-2">
                                    <span class="text-xs">全人力侦测</span>
                                </label>
                                <label class="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer">
                                    <input type="checkbox" id="filterPersonType2"
                                           ${filterState.personTypes && filterState.personTypes.includes('半人力授权+侦测') ? 'checked' : ''}
                                           onchange="MonthlyScheduleConfigManager.updatePersonTypeFilter()"
                                           class="mr-2">
                                    <span class="text-xs">半人力授权+侦测</span>
                                </label>
                                <label class="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer">
                                    <input type="checkbox" id="filterPersonType3"
                                           ${filterState.personTypes && filterState.personTypes.includes('全人力授权+大夜侦测') ? 'checked' : ''}
                                           onchange="MonthlyScheduleConfigManager.updatePersonTypeFilter()"
                                           class="mr-2">
                                    <span class="text-xs">全人力授权+大夜侦测</span>
                                </label>
                                <label class="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer">
                                    <input type="checkbox" id="filterPersonType4"
                                           ${filterState.personTypes && filterState.personTypes.includes('授权人员支援侦测+大夜授权') ? 'checked' : ''}
                                           onchange="MonthlyScheduleConfigManager.updatePersonTypeFilter()"
                                           class="mr-2">
                                    <span class="text-xs">授权人员支援侦测+大夜授权</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <p class="text-sm text-gray-600">共 ${displayStaffData.length} / ${allStaffData.length} 条有效人员记录，${dateList.length} 天排班周期</p>
        </div>
        `;

        html += `
        <div class="overflow-auto" style="max-height: 600px;">
            <table class="min-w-full divide-y divide-gray-200 border-collapse" style="table-layout: fixed;">
                <thead class="bg-gray-50 sticky top-0 z-10">
                    <tr>
                        <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300" 
                            style="width: 60px; min-width: 60px;">
                            ID
                        </th>
                        <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300" 
                            style="width: 70px; min-width: 70px;">
                            姓名
                        </th>
                        <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-green-100" 
                            style="width: 80px; min-width: 80px;">
                            归属地
                        </th>
                        <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-blue-100" 
                            style="width: 100px; min-width: 100px;">
                            人员类型
                        </th>
                        <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-orange-100" 
                            style="width: 80px; min-width: 80px;">
                            应上白班天数
                        </th>
                        <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-blue-100" 
                            style="width: 60px; min-width: 60px;">
                            班别
                        </th>
                        ${dateList.map((d, idx) => {
                            const dateStr = d.dateStr;
                            const isConnectedToSpecial = connectedToSpecial[idx] === true;
                            
                            // 【修复】完全按照大夜管理的逻辑来判断颜色
                            // 颜色逻辑（与大夜管理保持一致）：
                            // 1. 特殊节假日 + 休息日 -> 红色（bg-red-500）
                            // 2. 与特殊节假日连通的休息日 -> 红色（bg-red-500）
                            // 3. 普通休息日（未连通特殊节假日）-> 蓝色（bg-blue-400）
                            // 4. 普通工作日 -> 灰色（bg-gray-50）
                            let bgColor, textColor, borderColor;

                            if (specialFlags[dateStr] && restDaysMap[dateStr]) {
                                // 特殊节假日且是休息日 -> 红色
                                bgColor = 'bg-red-500';
                                textColor = 'text-white';
                                borderColor = 'border-red-600';
                            } else if (restDaysMap[dateStr] && isConnectedToSpecial) {
                                // 与特殊节假日连通的休息日 -> 红色
                                bgColor = 'bg-red-500';
                                textColor = 'text-white';
                                borderColor = 'border-red-600';
                            } else if (restDaysMap[dateStr]) {
                                // 休息日（周末或工作日被标记为休息）未连通特殊假日 -> 蓝色
                                bgColor = 'bg-blue-400';
                                textColor = 'text-white';
                                borderColor = 'border-blue-500';
                            } else {
                                // 工作日（包含特殊节假日被设为工作日、周末被设为工作日、普通工作日）
                                bgColor = 'bg-gray-50';
                                textColor = 'text-gray-900';
                                borderColor = 'border-gray-300';
                            }

                            return `
                                <th class="px-0.5 py-1 text-center text-xs font-medium ${textColor} uppercase border ${borderColor} ${bgColor}" 
                                    style="width: 30px; min-width: 30px;">
                                    <div class="text-xs font-bold">${d.day}</div>
                                    <div class="text-xs">${d.weekday}</div>
                                </th>
                            `;
                        }).join('')}
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-100">
        `;

        displayStaffData.forEach(staff => {
            const staffId = staff.staffId || staff.id;
            const staffName = staff.staffName || staff.name || '';
            const staffLocation = staff.location || '';
            const staffPersonType = staff.personType || '';
            const staffGender = staff.gender || '';
            const expectedWorkDays = expectedWorkDaysMap[staffId] != null ? expectedWorkDaysMap[staffId] : '-';

            const staffSchedule = staffScheduleData[staffId] || {};
            const staffShiftType = staffSchedule.shiftType || '';
            const dailySchedule = staffSchedule.dailySchedule || {};
            const staffRequests = personalRequests[staffId] || {};
            const nightShiftDays = nightShiftMap[staffId] || {};

            html += `
                <tr>
                    <td class="px-1 py-1 whitespace-nowrap text-center text-gray-700" style="width: 60px;">${staffId || '-'}</td>
                    <td class="px-1 py-1 whitespace-nowrap text-center text-gray-700" style="width: 70px;">${staffName}</td>
                    <td class="px-1 py-1 whitespace-nowrap text-center text-gray-700" style="width: 80px;">${staffLocation}</td>
                    <td class="px-1 py-1 whitespace-nowrap text-center text-gray-700" style="width: 100px;">${staffPersonType}</td>
                    <td class="px-1 py-1 whitespace-nowrap text-center text-gray-700 font-semibold" style="width: 80px;">${expectedWorkDays}</td>
                    <td class="px-1 py-1 whitespace-nowrap text-center" style="width: 60px;">
                        <select class="border border-gray-300 rounded px-1 py-0.5 text-xs w-full bg-white hover:bg-gray-50 cursor-pointer"
                                onmousedown="event.stopPropagation()"
                                onclick="event.stopPropagation()"
                                onchange="MonthlyScheduleConfigManager.updateShiftType('${configId}', '${staffId}', this.value)">
                            <option value="">未设置</option>
                            ${shiftTypes.map(type => `
                                <option value="${type}" ${staffShiftType === type ? 'selected' : ''}>${type}</option>
                            `).join('')}
                        </select>
                    </td>
                    ${dateList.map((d, idx) => {
                        const dateStr = d.dateStr;
                        const skillValue = dailySchedule[dateStr] || '';
                        const nightShiftType = nightShiftDays[dateStr]; // 'night' 或 'rest' 或 undefined
                        const vacationType = staffRequests[dateStr] || '';
                        const isRestDay = restDaysMap[dateStr] === true;
                        const isSpecial = specialFlags[dateStr] === true;
                        const isConnected = connectedToSpecial[idx] === true;

                        let cellClass = 'px-0.5 py-1 text-center text-xs border';
                        let displayText = skillValue;
                        let tooltip = dateStr;
                        let bgColor = 'bg-white';
                        let textColor = 'text-gray-700';
                        let borderColor = 'border-gray-300';
                        let isLocked = false; // 是否锁定（不可编辑）
                        let onclick = ''; // 点击事件

                        // 【修复】完全按照大夜管理的逻辑来渲染单元格
                        // 优先级：大夜 > 休整期 > 休假 > 技能
                        
                        if (nightShiftType === 'night') {
                            // 大夜（不可编辑）
                            cellClass += ' bg-purple-500 text-white font-semibold border-purple-600 cursor-not-allowed';
                            displayText = '夜';
                            tooltip = '大夜排班（不可更改）';
                            isLocked = true;
                        } else if (nightShiftType === 'rest') {
                            // 休整期（不可编辑）
                            cellClass += ' bg-green-500 text-white font-semibold border-green-600 cursor-not-allowed';
                            displayText = '休整';
                            tooltip = '大夜后休整期（不可更改）';
                            isLocked = true;
                        } else if (vacationType === 'ANNUAL') {
                            // 年假（不可编辑）
                            cellClass += ' bg-blue-200 text-blue-900 border-blue-300 cursor-not-allowed';
                            displayText = '年';
                            tooltip = '年假（已配置个性化休假，不可更改）';
                            isLocked = true;
                        } else if (vacationType === 'LEGAL') {
                            // 法定休（不可编辑）
                            cellClass += ' bg-green-200 text-green-900 border-green-300 cursor-not-allowed';
                            displayText = '法';
                            tooltip = '法定休（已配置个性化休假，不可更改）';
                            isLocked = true;
                        } else if (vacationType === 'REQ') {
                            // 个性化休假（不可编辑）
                            if (isSpecial && isRestDay) {
                                // 特殊节假日 + 休息日
                                cellClass += ' bg-red-500 text-white font-semibold border-red-600 cursor-not-allowed';
                                displayText = '休';
                                tooltip = '特殊节假日/连通休假（不可更改）';
                            } else if (isRestDay && isConnected) {
                                // 连通特殊节假日的休息日
                                cellClass += ' bg-red-500 text-white font-semibold border-red-600 cursor-not-allowed';
                                displayText = '休';
                                tooltip = '连通特殊节假日的休息日（不可更改）';
                            } else if (isRestDay) {
                                // 普通休息日
                                cellClass += ' bg-blue-400 text-white font-semibold border-blue-500 cursor-not-allowed';
                                displayText = '休';
                                tooltip = '普通休息日休假（不可更改）';
                            } else {
                                // 工作日休假
                                cellClass += ' bg-blue-200 text-blue-900 border-blue-300 cursor-not-allowed';
                                displayText = '休';
                                tooltip = '工作日休假（不可更改）';
                            }
                            isLocked = true;
                        } else if (skillValue) {
                            // 技能（可编辑）
                            cellClass += ' bg-blue-50 text-blue-700 border-gray-300 cursor-pointer hover:bg-blue-100';
                            tooltip = `技能：${skillValue}（点击切换技能）`;
                            onclick = `MonthlyScheduleConfigManager.handleSkillCellClick('${staffId}', '${dateStr}', event)`;
                        } else {
                            // 空白单元格（可编辑）
                            cellClass += ' bg-gray-50 text-gray-700 border-gray-300 cursor-pointer hover:bg-gray-100';
                            tooltip = '未设置技能（点击设置技能）';
                            onclick = `MonthlyScheduleConfigManager.handleSkillCellClick('${staffId}', '${dateStr}', event)`;
                        }

                        return `
                        <td class="${cellClass}" 
                            style="width: 30px;"
                            data-schedule-cell="1"
                            data-staff-id="${staffId}"
                            data-date-str="${dateStr}"
                            data-locked="${isLocked ? 'true' : 'false'}"
                            title="${tooltip}"
                            ${onclick ? `onclick="${onclick}"` : ''}>
                            <span class="text-xs font-medium" data-skill-text="1">${displayText}</span>
                        </td>
                        `;
                    }).join('')}
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        </div>
        `;

        return html;
    }
};

// 暴露到全局作用域
if (typeof window !== 'undefined') {
    window.MonthlyScheduleTableRenderer = MonthlyScheduleTableRenderer;
}
