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
            connectedToSpecial = {},
            validationTables = {},
            generationJob = null,
            analysisConfig = {},
            hasGeneratedScheduleResult = false
        } = params;

        const safeConfigName = currentConfigName || '未命名配置';
        const safeIdFilter = filterState.idFilter || '';
        const safeNameFilter = filterState.nameFilter || '';
        const allLocations = (typeof CityUtils !== 'undefined' && CityUtils.getAllLocationNames)
            ? CityUtils.getAllLocationNames()
            : ['上海', '成都'];
        const locationDisplay = (filterState.locations && filterState.locations.length >= allLocations.length)
            ? '全部'
            : (filterState.locations || []).join(', ');
        const personTypeDisplay = (filterState.personTypes && filterState.personTypes.length === 4)
            ? '全部'
            : (filterState.personTypes || []).join(', ');
        const generationStatus = String((generationJob && generationJob.status) || 'idle').toLowerCase();
        const generationProgressRaw = generationJob && generationJob.progress != null ? Number(generationJob.progress) : 0;
        const generationProgress = Number.isFinite(generationProgressRaw)
            ? Math.max(0, Math.min(100, generationProgressRaw))
            : 0;
        const shouldShowResultAnalysis = generationProgress >= 100;
        const isGenerating = generationStatus === 'running';
        const generationButtonClass = isGenerating
            ? 'px-3 py-2 bg-blue-300 text-white rounded-md transition-colors text-sm font-medium cursor-not-allowed'
            : 'px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium';
        const generationButtonText = isGenerating ? '后台生成中...' : '生成月度班次配置';

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
                        清空所有职能与班别
                    </button>
                    <button onclick="MonthlyScheduleConfigManager.generateMonthlyScheduleConfig()"
                        ${isGenerating ? 'disabled' : ''}
                        class="${generationButtonClass}">
                        ${generationButtonText}
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

            ${this.renderGenerationProgressPanel(generationJob, configId)}
            ${shouldShowResultAnalysis ? this.renderResultAnalysisPanel(validationTables, analysisConfig) : ''}

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
                                   value="${locationDisplay || '全部'}"
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
            
            // 【新增】调试日志
            if (typeof console !== 'undefined' && console.log) {
                if (Object.keys(nightShiftDays).length > 0) {
                    console.log(`[Renderer] 员工 ${staffId} 的夜班数据:`, nightShiftDays);
                }
            }

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
                            tooltip = `职能：${skillValue}（点击切换）`;
                            onclick = `MonthlyScheduleConfigManager.handleSkillCellClick('${staffId}', '${dateStr}', event)`;
                        } else {
                            // 空白单元格（可编辑）
                            cellClass += ' bg-gray-50 text-gray-700 border-gray-300 cursor-pointer hover:bg-gray-100';
                            tooltip = '未设置职能（点击设置）';
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

        if (hasGeneratedScheduleResult) {
            html += this.renderValidationSection({
                validationTables,
                shiftTypes,
                skillTypes: this.getSkillTypesFromRows(validationTables)
            });
        }

        return html;
    },

    renderGenerationProgressPanel(generationJob, configId) {
        const job = (generationJob && typeof generationJob === 'object') ? generationJob : null;
        const status = String((job && job.status) || 'idle').toLowerCase();
        const progressRaw = job && job.progress != null ? Number(job.progress) : 0;
        const progress = Number.isFinite(progressRaw) ? Math.max(0, Math.min(100, progressRaw)) : 0;
        const stageLabel = job && job.stageLabel ? job.stageLabel : '未开始';
        const message = job && job.message ? job.message : '点击“生成月度班次配置”后，将在后台持续运行。';
        const startedAt = job && job.startedAt ? String(job.startedAt) : '-';
        const updatedAt = job && job.updatedAt ? String(job.updatedAt) : '-';
        const statusLabel = status === 'running'
            ? '运行中'
            : (status === 'completed' ? '已完成' : (status === 'failed' ? '失败' : '待执行'));
        const statusClass = status === 'failed'
            ? 'bg-red-100 text-red-700'
            : (status === 'completed'
                ? 'bg-green-100 text-green-700'
                : (status === 'running' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'));
        const barClass = status === 'failed'
            ? 'bg-red-500'
            : (status === 'completed' ? 'bg-green-500' : 'bg-blue-500');

        return `
            <div id="monthlyGenerationProgressCard" data-config-id="${configId}" class="mt-3 p-3 rounded-lg border border-blue-100 bg-blue-50">
                <div class="flex items-center justify-between mb-2">
                    <div class="text-sm font-semibold text-gray-700">月度班次生成进度</div>
                    <span id="monthlyGenerationProgressStatus" class="inline-flex px-2 py-0.5 rounded text-xs ${statusClass}">${statusLabel}</span>
                </div>
                <div class="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
                    <div id="monthlyGenerationProgressBar" class="h-2 rounded-full transition-all duration-300 ${barClass}" style="width:${progress}%"></div>
                </div>
                <div id="monthlyGenerationProgressText" class="text-xs text-gray-700">${message}</div>
                <div id="monthlyGenerationProgressMeta" class="text-xs text-gray-500 mt-1">
                    阶段: ${stageLabel} | 进度: ${Math.round(progress)}% | 开始: ${startedAt} | 更新: ${updatedAt}
                </div>
                <div class="text-xs text-gray-500 mt-1">提示: 可随时点击“返回配置列表”，后台求解会继续执行。</div>
            </div>
        `;
    },

    buildResultAnalysisModel(validationTables = {}, analysisConfig = {}) {
        const dailyShiftRows = Array.isArray(validationTables.dailyShiftRows) ? validationTables.dailyShiftRows : [];
        const dailySkillRows = Array.isArray(validationTables.dailySkillRows) ? validationTables.dailySkillRows : [];
        const staffMonthlyRows = Array.isArray(validationTables.staffMonthlyRows) ? validationTables.staffMonthlyRows : [];
        const solverMeta = (validationTables.solverProgressMeta && typeof validationTables.solverProgressMeta === 'object')
            ? validationTables.solverProgressMeta
            : {};
        const skillTolerance = Number.isFinite(Number(validationTables.skillTolerance))
            ? Math.max(0, Number(validationTables.skillTolerance))
            : 1;
        const maxExtraDayPerStaff = Number.isFinite(Number(analysisConfig.maxExtraDayPerStaff))
            ? Math.max(0, Math.floor(Number(analysisConfig.maxExtraDayPerStaff)))
            : null;
        const maxConsecutiveWorkDays = Number.isFinite(Number(analysisConfig.maxConsecutiveWorkDays))
            ? Math.max(0, Math.floor(Number(analysisConfig.maxConsecutiveWorkDays)))
            : 0;
        const minConsecutiveRestDays = Number.isFinite(Number(analysisConfig.minConsecutiveRestDays))
            ? Math.max(0, Math.floor(Number(analysisConfig.minConsecutiveRestDays)))
            : 0;
        const hard = {
            dailyShortage: Number(solverMeta.finalDailyShortage || 0),
            total: Number(solverMeta.finalHardTotal || 0),
            targetMismatch: Number(solverMeta.finalTargetMismatch || 0)
        };
        const hardPassed = hard.total === 0 && hard.dailyShortage === 0 && hard.targetMismatch === 0;
        const shiftPassCount = dailyShiftRows.filter((row) => row && row.isPass === true).length;
        const skillPassCount = dailySkillRows.filter((row) => row && row.isPass === true).length;
        const shiftTotal = dailyShiftRows.length;
        const skillTotal = dailySkillRows.length;

        let underCount = 0;
        let overCount = 0;
        let exactCount = 0;
        let severeOverCount = 0;
        const staffAlerts = [];
        staffMonthlyRows.forEach((row) => {
            if (!row || typeof row !== 'object') return;
            const expectedDayShift = Number(row.expectedDayShiftDays || 0);
            const actualDayShift = Number(row.actualDayShiftDays || 0);
            const delta = actualDayShift - expectedDayShift;
            const issues = [];
            let level = 'ok';
            let score = 0;
            if (delta < 0) {
                underCount += 1;
                level = 'danger';
                score += 180 + Math.abs(delta) * 10;
                issues.push(`白班欠排 ${Math.abs(delta)} 天`);
            } else if (delta > 0) {
                overCount += 1;
                if (maxExtraDayPerStaff != null && delta > maxExtraDayPerStaff) {
                    severeOverCount += 1;
                    level = 'danger';
                    score += 150 + (delta - maxExtraDayPerStaff) * 12;
                    issues.push(`白班超排 ${delta} 天（超上限 ${maxExtraDayPerStaff}）`);
                } else {
                    if (level !== 'danger') level = 'warning';
                    score += 90 + delta * 6;
                    issues.push(`白班超排 ${delta} 天`);
                }
            } else {
                exactCount += 1;
            }

            const longestWork = Number(row.longestWork || 0);
            const longestRest = Number(row.longestRest || 0);
            if (maxConsecutiveWorkDays > 0 && longestWork > maxConsecutiveWorkDays) {
                level = 'danger';
                score += 80 + (longestWork - maxConsecutiveWorkDays) * 8;
                issues.push(`最长连续上班 ${longestWork} 天（阈值 ${maxConsecutiveWorkDays}）`);
            }
            if (minConsecutiveRestDays > 0 && longestRest < minConsecutiveRestDays) {
                if (level !== 'danger') level = 'warning';
                score += 45 + (minConsecutiveRestDays - longestRest) * 5;
                issues.push(`最长连续休假 ${longestRest} 天（建议≥${minConsecutiveRestDays}）`);
            }

            const expectedRest = Number(row.expectedRestDays || 0);
            const actualRest = Number(row.actualRestDays || 0);
            if (actualRest + 1 < expectedRest) {
                if (level !== 'danger') level = 'warning';
                score += (expectedRest - actualRest) * 4;
                issues.push(`实际休假偏少 ${expectedRest - actualRest} 天`);
            }

            if (issues.length > 0) {
                staffAlerts.push({
                    staffId: String(row.staffId || ''),
                    staffName: String(row.staffName || ''),
                    level,
                    score,
                    issues,
                    expectedDayShift,
                    actualDayShift
                });
            }
        });

        const levelRank = (level) => {
            if (level === 'danger') return 2;
            if (level === 'warning') return 1;
            return 0;
        };
        staffAlerts.sort((a, b) => {
            const lr = levelRank(b.level) - levelRank(a.level);
            if (lr !== 0) return lr;
            if (b.score !== a.score) return b.score - a.score;
            return String(a.staffId).localeCompare(String(b.staffId));
        });

        const skillByDate = {};
        dailySkillRows.forEach((row) => {
            if (!row || !row.dateStr) return;
            skillByDate[String(row.dateStr)] = row;
        });

        const dailyAlerts = [];
        dailyShiftRows.forEach((row) => {
            if (!row || !row.dateStr) return;
            const issues = [];
            let level = 'ok';
            let score = 0;
            const gap = (row.gap && typeof row.gap === 'object') ? row.gap : {};

            const shortages = Object.entries(gap)
                .filter(([, v]) => Number(v) < 0)
                .map(([k, v]) => `${k}${Number(v)}`);
            if (shortages.length > 0) {
                level = 'danger';
                score += 150 + shortages.length * 10;
                issues.push(`缺班: ${shortages.join('，')}`);
            }

            const blocked = Number(row.blockedConflicts || 0);
            if (blocked > 0) {
                level = 'danger';
                score += 100 + blocked * 5;
                issues.push(`阻塞冲突 ${blocked} 个`);
            }

            const overfilled = Object.entries(gap)
                .filter(([, v]) => Number(v) > 1)
                .map(([k, v]) => `${k}+${Number(v)}`);
            if (overfilled.length > 0) {
                if (level !== 'danger') level = 'warning';
                score += overfilled.length * 5;
                issues.push(`超配: ${overfilled.join('，')}`);
            }

            const skillRow = skillByDate[String(row.dateStr)];
            if (skillRow && skillRow.gap && typeof skillRow.gap === 'object') {
                const skillIssues = Object.entries(skillRow.gap)
                    .map(([k, v]) => ({ skill: k, gap: Number(v) }))
                    .filter((item) => Math.abs(item.gap) > skillTolerance)
                    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
                if (skillIssues.length > 0) {
                    if (level !== 'danger') level = 'warning';
                    score += skillIssues.length * 4;
                    const topText = skillIssues.slice(0, 3).map((it) => `${it.skill}${it.gap >= 0 ? '+' : ''}${it.gap}`).join('，');
                    issues.push(`技能偏差: ${topText}`);
                }
            }

            if (issues.length > 0) {
                dailyAlerts.push({
                    dateStr: String(row.dateStr || ''),
                    weekday: String(row.weekday || ''),
                    level,
                    score,
                    issues
                });
            }
        });

        dailyAlerts.sort((a, b) => {
            const lr = levelRank(b.level) - levelRank(a.level);
            if (lr !== 0) return lr;
            if (b.score !== a.score) return b.score - a.score;
            return String(a.dateStr).localeCompare(String(b.dateStr));
        });

        return {
            hard,
            hardPassed,
            solverMeta,
            shiftPassCount,
            shiftTotal,
            skillPassCount,
            skillTotal,
            staffTotal: staffMonthlyRows.length,
            underCount,
            overCount,
            exactCount,
            severeOverCount,
            staffAlerts,
            dailyAlerts
        };
    },

    renderResultAnalysisPanel(validationTables = {}, analysisConfig = {}) {
        const model = this.buildResultAnalysisModel(validationTables, analysisConfig);
        const hasData = model.shiftTotal > 0 || model.skillTotal > 0 || model.staffTotal > 0;
        if (!hasData) {
            return `
                <div class="mt-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
                    <div class="text-sm font-semibold text-gray-700 mb-1">排班结果分析</div>
                    <div class="text-xs text-gray-500">生成后将在此展示约束完成度、员工关注点、每日关注点。</div>
                </div>
            `;
        }

        const hardBadge = this.renderStatusBadge(model.hardPassed ? 'PASS' : 'FAIL');
        const shiftRate = model.shiftTotal > 0
            ? `${model.shiftPassCount}/${model.shiftTotal}`
            : '-';
        const skillRate = model.skillTotal > 0
            ? `${model.skillPassCount}/${model.skillTotal}`
            : '-';
        const employeeFocusTop = model.staffAlerts.slice(0, 8);
        const dailyFocusTop = model.dailyAlerts.slice(0, 8);
        const requestedMode = String(model.solverMeta.requestedMode || '-').toUpperCase();
        const usedMode = String(model.solverMeta.usedMode || '-').toUpperCase();
        const strictMIP = model.solverMeta.strictMIP === true ? 'ON' : 'OFF';

        return `
            <div class="mt-3 p-3 rounded-lg border border-indigo-100 bg-indigo-50">
                <div class="flex items-start justify-between gap-3 mb-2">
                    <div>
                        <div class="text-sm font-semibold text-gray-800">排班结果分析</div>
                        <div class="text-xs text-gray-600 mt-0.5">
                            算法: 请求=${requestedMode}，实际=${usedMode}，strictMIP=${strictMIP}
                        </div>
                    </div>
                    <div>${hardBadge}</div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
                    <div class="rounded border border-white bg-white p-2">
                        <div class="text-xs text-gray-500">硬约束完成度</div>
                        <div class="text-sm font-semibold text-gray-800 mt-1">
                            缺班/总违约/目标差 = ${model.hard.dailyShortage}/${model.hard.total}/${model.hard.targetMismatch}
                        </div>
                    </div>
                    <div class="rounded border border-white bg-white p-2">
                        <div class="text-xs text-gray-500">每日班别达成</div>
                        <div class="text-sm font-semibold text-gray-800 mt-1">${shiftRate}</div>
                    </div>
                    <div class="rounded border border-white bg-white p-2">
                        <div class="text-xs text-gray-500">每日技能达成</div>
                        <div class="text-sm font-semibold text-gray-800 mt-1">${skillRate}</div>
                    </div>
                    <div class="rounded border border-white bg-white p-2">
                        <div class="text-xs text-gray-500">人员白班目标</div>
                        <div class="text-sm font-semibold text-gray-800 mt-1">
                            达标 ${model.exactCount} / 欠排 ${model.underCount} / 超排 ${model.overCount}
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div class="rounded border border-white bg-white p-2">
                        <div class="text-xs font-semibold text-gray-700 mb-2">员工关注点（Top ${employeeFocusTop.length}）</div>
                        ${employeeFocusTop.length === 0
                            ? '<div class="text-xs text-gray-500">暂无明显人员风险</div>'
                            : `
                                <div class="space-y-1.5">
                                    ${employeeFocusTop.map((item) => `
                                        <div class="text-xs border border-gray-200 rounded px-2 py-1 bg-gray-50">
                                            <div class="flex items-center justify-between gap-2">
                                                <div class="font-semibold text-gray-700">${item.staffId} ${item.staffName || ''}</div>
                                                <span class="inline-flex px-2 py-0.5 rounded ${item.level === 'danger' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}">${item.level === 'danger' ? '重点关注' : '关注'}</span>
                                            </div>
                                            <div class="text-gray-600 mt-0.5">${item.issues.join('；')}</div>
                                        </div>
                                    `).join('')}
                                </div>
                            `}
                    </div>
                    <div class="rounded border border-white bg-white p-2">
                        <div class="text-xs font-semibold text-gray-700 mb-2">每日关注点（Top ${dailyFocusTop.length}）</div>
                        ${dailyFocusTop.length === 0
                            ? '<div class="text-xs text-gray-500">暂无明显日期风险</div>'
                            : `
                                <div class="space-y-1.5">
                                    ${dailyFocusTop.map((item) => `
                                        <div class="text-xs border border-gray-200 rounded px-2 py-1 bg-gray-50">
                                            <div class="flex items-center justify-between gap-2">
                                                <div class="font-semibold text-gray-700">${item.dateStr} ${item.weekday || ''}</div>
                                                <span class="inline-flex px-2 py-0.5 rounded ${item.level === 'danger' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}">${item.level === 'danger' ? '重点关注' : '关注'}</span>
                                            </div>
                                            <div class="text-gray-600 mt-0.5">${item.issues.join('；')}</div>
                                        </div>
                                    `).join('')}
                                </div>
                            `}
                    </div>
                </div>

                <details class="mt-3">
                    <summary class="text-xs text-blue-700 cursor-pointer select-none">
                        查看完整关注清单（员工 ${model.staffAlerts.length} 条 / 每日 ${model.dailyAlerts.length} 条）
                    </summary>
                    <div class="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <div class="border border-gray-200 rounded bg-white p-2 overflow-auto" style="max-height: 240px;">
                            <div class="text-xs font-semibold text-gray-700 mb-1">员工完整清单</div>
                            ${model.staffAlerts.length === 0
                                ? '<div class="text-xs text-gray-500">无</div>'
                                : `
                                    <table class="min-w-full border-collapse">
                                        <thead class="bg-gray-50">
                                            <tr>
                                                <th class="px-2 py-1 border border-gray-200 text-xs text-left">员工</th>
                                                <th class="px-2 py-1 border border-gray-200 text-xs text-center">级别</th>
                                                <th class="px-2 py-1 border border-gray-200 text-xs text-left">关注点</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${model.staffAlerts.map((item) => `
                                                <tr>
                                                    <td class="px-2 py-1 border border-gray-200 text-xs">${item.staffId} ${item.staffName || ''}</td>
                                                    <td class="px-2 py-1 border border-gray-200 text-xs text-center">${item.level === 'danger' ? '重点' : '关注'}</td>
                                                    <td class="px-2 py-1 border border-gray-200 text-xs">${item.issues.join('；')}</td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                `}
                        </div>
                        <div class="border border-gray-200 rounded bg-white p-2 overflow-auto" style="max-height: 240px;">
                            <div class="text-xs font-semibold text-gray-700 mb-1">每日完整清单</div>
                            ${model.dailyAlerts.length === 0
                                ? '<div class="text-xs text-gray-500">无</div>'
                                : `
                                    <table class="min-w-full border-collapse">
                                        <thead class="bg-gray-50">
                                            <tr>
                                                <th class="px-2 py-1 border border-gray-200 text-xs text-left">日期</th>
                                                <th class="px-2 py-1 border border-gray-200 text-xs text-center">级别</th>
                                                <th class="px-2 py-1 border border-gray-200 text-xs text-left">关注点</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${model.dailyAlerts.map((item) => `
                                                <tr>
                                                    <td class="px-2 py-1 border border-gray-200 text-xs">${item.dateStr} ${item.weekday || ''}</td>
                                                    <td class="px-2 py-1 border border-gray-200 text-xs text-center">${item.level === 'danger' ? '重点' : '关注'}</td>
                                                    <td class="px-2 py-1 border border-gray-200 text-xs">${item.issues.join('；')}</td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                `}
                        </div>
                    </div>
                </details>
            </div>
        `;
    },

    getSkillTypesFromRows(validationTables = {}) {
        const sample = (validationTables.dailySkillRows || [])[0];
        if (sample && sample.actual && typeof sample.actual === 'object') {
            return Object.keys(sample.actual);
        }
        return ['星', '综', '收', '网', '天', '微', '银B', '追', '毛'];
    },

    renderValidationSection({ validationTables = {}, shiftTypes = [], skillTypes = [] }) {
        const solverProgressRows = validationTables.solverProgressRows || [];
        const solverProgressMeta = validationTables.solverProgressMeta || {};
        const dailyShiftRows = validationTables.dailyShiftRows || [];
        const dailySkillRows = validationTables.dailySkillRows || [];
        const staffMonthlyRows = validationTables.staffMonthlyRows || [];
        const skillTolerance = Number.isFinite(Number(validationTables.skillTolerance))
            ? Number(validationTables.skillTolerance)
            : 1;

        return `
            <div class="mt-4 p-4 bg-white border-t border-gray-200">
                <h3 class="text-base font-bold text-gray-800 mb-3">排班结果校验明细（底部）</h3>
                <div class="space-y-4">
                    ${this.renderSolverProgressTable(solverProgressRows, solverProgressMeta)}
                    ${this.renderDailyShiftValidationTable(dailyShiftRows, shiftTypes)}
                    ${this.renderDailySkillValidationTable(dailySkillRows, skillTypes, skillTolerance)}
                    ${this.renderStaffMonthlyStatsTable(staffMonthlyRows)}
                </div>
            </div>
        `;
    },

    renderSolverProgressTable(rows, meta = {}) {
        const requestedMode = String(meta.requestedMode || '-').toUpperCase();
        const usedMode = String(meta.usedMode || '-').toUpperCase();
        const strict = meta.strictMIP ? 'ON' : 'OFF';
        const finalDailyShortage = Number(meta.finalDailyShortage || 0);
        const finalHardTotal = Number(meta.finalHardTotal || 0);
        const finalTargetMismatch = Number(meta.finalTargetMismatch || 0);
        const selectedLabel = meta.selectedProfileId
            ? `${meta.selectedProfileId}${meta.selectedProfileName ? `(${meta.selectedProfileName})` : ''}`
            : '-';

        if (!Array.isArray(rows) || rows.length === 0) {
            return `
                <div class="border border-gray-200 rounded-md p-3">
                    <div class="text-sm font-semibold text-gray-700 mb-1">求解重试进度表</div>
                    <div class="text-xs text-gray-600 mb-2">
                        算法: 请求=${requestedMode}，实际=${usedMode}，strictMIP=${strict}；
                        最终硬约束(缺班/总违约/目标差)= ${finalDailyShortage}/${finalHardTotal}/${finalTargetMismatch}
                    </div>
                    <div class="text-xs text-gray-500">暂无重试日志</div>
                </div>
            `;
        }

        return `
            <div class="border border-gray-200 rounded-md p-3">
                <div class="text-sm font-semibold text-gray-700 mb-1">求解重试进度表</div>
                <div class="text-xs text-gray-600 mb-2">
                    算法: 请求=${requestedMode}，实际=${usedMode}，strictMIP=${strict}；
                    采用策略=${selectedLabel}；
                    最终硬约束(缺班/总违约/目标差)= ${finalDailyShortage}/${finalHardTotal}/${finalTargetMismatch}
                </div>
                <div class="overflow-auto">
                    <table class="min-w-full border-collapse">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">序号</th>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-left">策略</th>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">前(缺班/总违约/目标差)</th>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">后(缺班/总违约/目标差)</th>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">重分班别人数</th>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">重排次数</th>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">轮次</th>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">回退轮次</th>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">状态</th>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">采用</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map((row) => {
                                const beforeText = `${Number(row.beforeShortage || 0)}/${Number(row.beforeTotal || 0)}/${Number(row.beforeTargetMismatch || 0)}`;
                                const afterText = `${Number(row.afterShortage || 0)}/${Number(row.afterTotal || 0)}/${Number(row.afterTargetMismatch || 0)}`;
                                const isWorse = Number(row.afterShortage || 0) > Number(row.beforeShortage || 0)
                                    || (Number(row.afterShortage || 0) === Number(row.beforeShortage || 0)
                                        && Number(row.afterTotal || 0) > Number(row.beforeTotal || 0));
                                const status = isWorse ? 'FAIL' : (row.isImproved ? 'PASS' : 'WARN');
                                return `
                                    <tr class="hover:bg-gray-50">
                                        <td class="px-2 py-1 border border-gray-200 text-xs text-center">${Number(row.index || 0)}</td>
                                        <td class="px-2 py-1 border border-gray-200 text-xs text-gray-700">${row.profileId || '-'} ${row.profileName ? `(${row.profileName})` : ''}</td>
                                        <td class="px-2 py-1 border border-gray-200 text-xs text-center">${beforeText}</td>
                                        <td class="px-2 py-1 border border-gray-200 text-xs text-center">${afterText}</td>
                                        <td class="px-2 py-1 border border-gray-200 text-xs text-center">${Number(row.monthlyReassignCount || 0)}</td>
                                        <td class="px-2 py-1 border border-gray-200 text-xs text-center">${Number(row.movedCount || 0)}</td>
                                        <td class="px-2 py-1 border border-gray-200 text-xs text-center">${Number(row.rounds || 0)}</td>
                                        <td class="px-2 py-1 border border-gray-200 text-xs text-center">${Number(row.rollbackRounds || 0)}</td>
                                        <td class="px-2 py-1 border border-gray-200 text-xs text-center">${this.renderStatusBadge(status)}</td>
                                        <td class="px-2 py-1 border border-gray-200 text-xs text-center">${row.isSelected ? '<span class="inline-flex px-2 py-0.5 rounded bg-blue-100 text-blue-700">YES</span>' : ''}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    renderDailyShiftValidationTable(rows, shiftTypes) {
        if (!Array.isArray(rows) || rows.length === 0) {
            return `
                <div class="border border-gray-200 rounded-md p-3">
                    <div class="text-sm font-semibold text-gray-700 mb-2">每日班别达成表（硬约束）</div>
                    <div class="text-xs text-gray-500">暂无数据</div>
                </div>
            `;
        }

        return `
            <div class="border border-gray-200 rounded-md p-3">
                <div class="text-sm font-semibold text-gray-700 mb-2">每日班别达成表（硬约束）</div>
                <div class="overflow-auto">
                    <table class="min-w-full border-collapse">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-left">日期</th>
                                ${shiftTypes.map((s) => `<th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">${s}(实/预/差)</th>`).join('')}
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">阻塞冲突</th>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">是否符合预期</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map((row) => {
                                const dateLabel = `${row.dateStr} ${row.weekday || ''}`.trim();
                                const blockedConflicts = Number(row.blockedConflicts || 0);
                                const blockedCls = blockedConflicts > 0 ? 'text-red-700 font-semibold' : 'text-green-700';
                                return `
                                    <tr class="hover:bg-gray-50">
                                        <td class="px-2 py-1 border border-gray-200 text-xs text-gray-700">${dateLabel}</td>
                                        ${shiftTypes.map((s) => {
                                            const a = Number(row.actual?.[s] || 0);
                                            const e = Number(row.expected?.[s] || 0);
                                            const g = Number(row.gap?.[s] || 0);
                                            const cls = g >= 0 ? 'text-green-700' : 'text-red-700';
                                            return `<td class="px-2 py-1 border border-gray-200 text-xs text-center ${cls}">${a}/${e}/${g}</td>`;
                                        }).join('')}
                                        <td class="px-2 py-1 border border-gray-200 text-xs text-center ${blockedCls}">${blockedConflicts}</td>
                                        <td class="px-2 py-1 border border-gray-200 text-xs text-center">${this.renderStatusBadge(row.isPass ? 'PASS' : 'FAIL')}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    renderDailySkillValidationTable(rows, skillTypes, skillTolerance) {
        if (!Array.isArray(rows) || rows.length === 0) {
            return `
                <div class="border border-gray-200 rounded-md p-3">
                    <div class="text-sm font-semibold text-gray-700 mb-2">每日技能达成表（软约束）</div>
                    <div class="text-xs text-gray-500">暂无数据</div>
                </div>
            `;
        }

        return `
            <div class="border border-gray-200 rounded-md p-3">
                <div class="text-sm font-semibold text-gray-700 mb-2">每日技能达成表（软约束，阈值 ±${skillTolerance}）</div>
                <div class="overflow-auto">
                    <table class="min-w-full border-collapse">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-left">日期</th>
                                ${skillTypes.map((s) => `<th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">${s}(实/预/差)</th>`).join('')}
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">是否符合预期</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map((row) => {
                                const dateLabel = `${row.dateStr} ${row.weekday || ''}`.trim();
                                return `
                                    <tr class="hover:bg-gray-50">
                                        <td class="px-2 py-1 border border-gray-200 text-xs text-gray-700">${dateLabel}</td>
                                        ${skillTypes.map((s) => {
                                            const a = Number(row.actual?.[s] || 0);
                                            const e = Number(row.expected?.[s] || 0);
                                            const g = Number(row.gap?.[s] || 0);
                                            const cls = Math.abs(g) <= skillTolerance ? 'text-green-700' : 'text-yellow-700';
                                            return `<td class="px-2 py-1 border border-gray-200 text-xs text-center ${cls}">${a}/${e}/${g}</td>`;
                                        }).join('')}
                                        <td class="px-2 py-1 border border-gray-200 text-xs text-center">${this.renderStatusBadge(row.isPass ? 'PASS' : 'WARN')}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    renderStaffMonthlyStatsTable(rows) {
        if (!Array.isArray(rows) || rows.length === 0) {
            return `
                <div class="border border-gray-200 rounded-md p-3">
                    <div class="text-sm font-semibold text-gray-700 mb-2">每人月度统计表</div>
                    <div class="text-xs text-gray-500">暂无数据</div>
                </div>
            `;
        }

        return `
            <div class="border border-gray-200 rounded-md p-3">
                <div class="text-sm font-semibold text-gray-700 mb-2">每人月度统计表</div>
                <div class="overflow-auto">
                    <table class="min-w-full border-collapse">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-left">员工ID</th>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-left">姓名</th>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">当周期总天数</th>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">大夜天数</th>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">个性化休假天数</th>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">应休假总天数</th>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">实际休假总天数</th>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">应上白班天数</th>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">实际安排白班天数</th>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">最长连续休假天数</th>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">最长连续上班天数</th>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">最短连续休假天数</th>
                                <th class="px-2 py-1 border border-gray-200 text-xs text-gray-600 text-center">最短连续上班天数</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map((row) => `
                                <tr class="hover:bg-gray-50">
                                    <td class="px-2 py-1 border border-gray-200 text-xs text-gray-700">${row.staffId || ''}</td>
                                    <td class="px-2 py-1 border border-gray-200 text-xs text-gray-700">${row.staffName || ''}</td>
                                    <td class="px-2 py-1 border border-gray-200 text-xs text-center">${Number(row.totalDays || 0)}</td>
                                    <td class="px-2 py-1 border border-gray-200 text-xs text-center">${Number(row.nightDays || 0)}</td>
                                    <td class="px-2 py-1 border border-gray-200 text-xs text-center">${Number(row.personalVacationDays || 0)}</td>
                                    <td class="px-2 py-1 border border-gray-200 text-xs text-center">${Number(row.expectedRestDays || 0)}</td>
                                    <td class="px-2 py-1 border border-gray-200 text-xs text-center">${Number(row.actualRestDays || 0)}</td>
                                    <td class="px-2 py-1 border border-gray-200 text-xs text-center">${Number(row.expectedDayShiftDays || 0)}</td>
                                    <td class="px-2 py-1 border border-gray-200 text-xs text-center">${Number(row.actualDayShiftDays || 0)}</td>
                                    <td class="px-2 py-1 border border-gray-200 text-xs text-center">${Number(row.longestRest || 0)}</td>
                                    <td class="px-2 py-1 border border-gray-200 text-xs text-center">${Number(row.longestWork || 0)}</td>
                                    <td class="px-2 py-1 border border-gray-200 text-xs text-center">${Number(row.shortestRest || 0)}</td>
                                    <td class="px-2 py-1 border border-gray-200 text-xs text-center">${Number(row.shortestWork || 0)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    renderStatusBadge(status) {
        const safe = String(status || '').toUpperCase();
        if (safe === 'PASS') {
            return '<span class="inline-flex px-2 py-0.5 rounded bg-green-100 text-green-700">PASS</span>';
        }
        if (safe === 'WARN') {
            return '<span class="inline-flex px-2 py-0.5 rounded bg-yellow-100 text-yellow-700">WARN</span>';
        }
        return '<span class="inline-flex px-2 py-0.5 rounded bg-red-100 text-red-700">FAIL</span>';
    }
};

// 暴露到全局作用域
if (typeof window !== 'undefined') {
    window.MonthlyScheduleTableRenderer = MonthlyScheduleTableRenderer;
}
