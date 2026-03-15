/**
 * 人员筛选器模块
 * 负责人员列表的筛选功能
 */

const STAFF_FILTER_PERSON_TYPES = ['全人力侦测', '半人力授权+侦测', '全人力授权+大夜侦测', '授权人员支援侦测+大夜授权'];
const STAFF_FILTER_LOCATIONS = (typeof CityUtils !== 'undefined' && CityUtils.getAllLocationNames)
    ? CityUtils.getAllLocationNames()
    : ['上海', '成都'];

function shouldFilterSelection(selected, allItems) {
    return selected.length > 0 && selected.length < allItems.length;
}

const StaffFilter = {
    /**
     * 初始化筛选状态
     * @returns {Object} 筛选状态对象
     */
    initFilterState() {
        return {
            personTypes: [...STAFF_FILTER_PERSON_TYPES], // 默认全部勾选
            locations: [...STAFF_FILTER_LOCATIONS], // 默认全部勾选
            idFilter: '',
            nameFilter: ''
        };
    },

    /**
     * 获取筛选状态（从全局变量或初始化）
     * @returns {Object} 筛选状态对象
     */
    getFilterState() {
        if (!window._staffFilterState) {
            window._staffFilterState = this.initFilterState();
        }
        return window._staffFilterState;
    },

    /**
     * 应用筛选条件
     * @param {Array} staffData - 人员数据数组
     * @param {Object} filterState - 筛选状态对象（可选，如果不提供则使用全局状态）
     * @returns {Array} 筛选后的人员数据数组
     */
    applyFilter(staffData, filterState = null) {
        const activeFilterState = filterState || this.getFilterState();
        const idFilter = activeFilterState.idFilter.trim().toLowerCase();
        const nameFilter = activeFilterState.nameFilter.trim().toLowerCase();

        return staffData.filter(staff => {
            const staffId = String(staff.staffId || staff.id || '').toLowerCase();
            const staffName = String(staff.name || '').toLowerCase();
            const staffPersonType = staff.personType || '';
            const staffLocation = staff.location || '';
            
            // 人员类型筛选（多选）- 如果选择了类型，则必须匹配
            if (shouldFilterSelection(activeFilterState.personTypes, STAFF_FILTER_PERSON_TYPES)
                && !activeFilterState.personTypes.includes(staffPersonType)) {
                return false;
            }
            
            // 归属地筛选（多选）- 如果选择了归属地，则必须匹配
            if (shouldFilterSelection(activeFilterState.locations, STAFF_FILTER_LOCATIONS)
                && !activeFilterState.locations.includes(staffLocation)) {
                return false;
            }
            
            // ID筛选（模糊匹配+精准匹配）
            if (idFilter && staffId !== idFilter && !staffId.includes(idFilter)) {
                return false;
            }
            
            // 姓名筛选（模糊匹配+精准匹配）
            if (nameFilter && staffName !== nameFilter && !staffName.includes(nameFilter)) {
                return false;
            }
            
            return true;
        });
    },

    /**
     * 清除筛选条件
     */
    clearFilter() {
        window._staffFilterState = this.initFilterState();
    },

    /**
     * 更新筛选状态（从DOM读取）
     * @returns {Object} 更新后的筛选状态
     */
    updateFilterStateFromDOM() {
        const filterState = this.getFilterState();
        
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
        
        return filterState;
    }
};

// 暴露到全局作用域
if (typeof window !== 'undefined') {
    window.StaffFilter = StaffFilter;
}

