/**
 * 功能：百度地图地址选择组件，支持地图选址、行政区选择、地址粘贴识别等能力
 * 作者：Codex
 * 时间：2026-04-24
 *
 * 说明：
 * 1. 使用自执行函数包裹代码，避免组件变量污染全局作用域。
 * 2. global 在浏览器里通常就是 window，文件末尾会把组件挂到 window.BaiduMapAddressPicker。
 * 3. component 是 Vue 组件主体，包含模板、数据、计算属性和方法。
 */
(function (global) {
  // 组件名称：用于 Vue 全局注册时的组件名。
  const componentName = 'baidu-map-address-picker';

  /**
   * 功能：按照首字母和名称排序城市/地区列表。
   * 入参：a、b 是包含 letter 和 name 的地区对象。
   * 出参：返回排序数字，小于 0 表示 a 在前，大于 0 表示 b 在前。
   * 异常：无。
   */
  function sortByLetterAndName(a, b) {
    if (a.letter === b.letter) {
      return a.name.localeCompare(b.name, 'zh-CN');
    }
    return a.letter.localeCompare(b.letter);
  }

  /**
   * 功能：根据名称取首字母，用于城市列表的 A-Z 分组。
   * 入参：name 是城市名、地区名或任意文本。
   * 出参：返回大写首字母；无法识别时返回空字符串。
   * 异常：无，空值会先安全转成空字符串。
   */
  function getLetter(name) {
    const value = String(name || '').trim();
    if (!value) return '';

    const first = value.charAt(0);
    if (/^[A-Za-z]$/.test(first)) {
      return first.toUpperCase();
    }

    const initialLetters = 'ABCDEFGHJKLMNOPQRSTWXYZ';
    const pinyinBoundaryChars = [
      '\u963f', '\u82ad', '\u64e6', '\u642d', '\u86fe', '\u53d1',
      '\u5676', '\u54c8', '\u51fb', '\u5580', '\u5783', '\u5988',
      '\u62ff', '\u54e6', '\u556a', '\u671f', '\u7136', '\u6492',
      '\u584c', '\u6316', '\u6614', '\u538b', '\u531d'
    ].join('');

    for (let i = 0; i < pinyinBoundaryChars.length; i++) {
      const current = pinyinBoundaryChars.charAt(i);
      const next = pinyinBoundaryChars.charAt(i + 1);
      if (first.localeCompare(current, 'zh-CN') >= 0 && (!next || first.localeCompare(next, 'zh-CN') < 0)) {
        return initialLetters.charAt(i) || '';
      }
    }

    return '';
  }

  // 组件主体：模板、数据、计算属性、方法都定义在这里。
  const component = {
    name: componentName,
    template: `
<div class="baidu-map-address-picker">
<transition name="fade-mask">
    <div class="mask" v-show="showAddressSheet"></div>
  </transition>

  <transition name="slide-up-sheet">
    <div class="sheet" v-show="showAddressSheet">
      <div class="sheet-header">
        请选择常住地址
        <div class="sheet-close" @click="closeAddressSheet">×</div>
      </div>

      <div class="sheet-body">
        <div class="tabs">
          <div
            class="tab"
            :class="{ active: activeTab === 'map' }"
            @click="switchMainTab('map')"
          >地图选址</div>
          <div
            class="tab"
            :class="{ active: activeTab === 'region' }"
            @click="switchMainTab('region')"
          >
            地区选址
            <small>（含港澳台）</small>
          </div>
        </div>

        <div class="sheet-card">
          <transition name="fade-tab" mode="out-in">
            <div :key="activeTab">
              <template v-if="activeTab === 'map'">
                <div :class="['line-row', sheetAddressTitle && sheetProviceCityDistrict ? 'align-items-start' : '']">
                  <div class="line-label">地址</div>
                  <div class="line-main" style="display:flex; align-items:center; gap:10px;">
                    <div style="flex:1; min-width:0;">
                      <div v-if="sheetAddressTitle && sheetProviceCityDistrict" class="address-title">
                        <span>{{ sheetAddressTitle }}</span>
                        <span class="province-group">{{ sheetProviceCityDistrict }}</span>
                      </div>
                      <div v-else class="address-empty">选择收货地址</div>
                    </div>
                    <div class="map-thumb" @click="openLocationPicker"></div>
                  </div>
                </div>

                <div class="line-row" style="padding-top:0;" v-if="!(sheetAddressTitle && sheetProviceCityDistrict)">
                  <div class="line-label"></div>
                  <div class="line-main">
                    <div class="location-box">
                      <div class="location-left">
                        <div class="location-name">{{ currentLocation.name || '定位中...' }}</div>
                        <div class="location-address">{{ currentLocation.address || '正在获取当前位置' }}</div>
                      </div>
                      <button class="btn-use" @click="useCurrentLocation">使用</button>
                    </div>
                  </div>
                </div>

                <div class="line-row">
                  <div class="line-label">门牌号</div>
                  <div class="line-main">
                    <input
                      class="door-input"
                      v-model.trim="sheetDoorNumber"
                      placeholder="例：6栋201室"
                    />
                  </div>
                </div>

              </template>

              <template v-if="activeTab === 'region'">
                <div class="line-row">
                  <div class="line-label">所在地区</div>
                  <div class="line-main">
                    <div
                      class="region-row"
                      :class="{ placeholder: !regionDisplayText }"
                      @click="openRegionSelector"
                    >
                      <span>{{ regionDisplayText || '省、市、区' }}</span>
                      <span class="region-arrow-right"></span>
                    </div>
                  </div>
                </div>

                <div class="line-row">
                  <div class="line-label">详细地址</div>
                  <div class="line-main">
                    <div class="region-detail-wrap">
                      <input
                        class="region-detail-input"
                        v-model.trim="regionForm.detailAddress"
                        placeholder="小区、门牌号"
                        @input="onRegionDetailInput"
                        @focus="onRegionDetailInput"
                      />
                      <div
                        class="region-detail-clear"
                        v-if="regionForm.detailAddress"
                        @click="clearRegionDetailInput"
                      >×</div>

                      <div class="region-suggest-panel" v-if="showRegionSuggest">
                        <div
                          class="region-suggest-item"
                          v-for="(item, index) in regionSuggestList"
                          :key="'region-suggest-' + index"
                          @click="selectRegionSuggestion(item)"
                        >
                          <div class="region-suggest-title">{{ item.title || item.name || item.keyword }}</div>
                          <div class="region-suggest-address">{{ item.address || '-' }}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </template>
            </div>
          </transition>

          <div class="paste-wrap">
            <div class="paste-panel">
              <div class="paste-collapse" :class="{ collapsed: !showPasteBoard }">
              <div class="paste-box">
                <textarea
                  v-model.trim="pasteText"
                  class="paste-textarea"
                  :placeholder="activeTab === 'map'
                    ? '试试粘贴你的常用地址，包含省市区以及街道的详细地址，可快速识别您的地址信息'
                    : '试试粘贴收件人姓名、手机号、收货地址，可快速识别您的收货信息'"
                ></textarea>

                <div class="paste-actions" v-show="pasteText">
                  <button class="paste-action-btn clear-btn" @click="clearPasteText" :disabled="isParsingPaste">清除</button>
                  <button
                    class="paste-action-btn submit-btn"
                    :class="{ loading: isParsingPaste }"
                    :disabled="isParsingPaste"
                    @click="parsePastedAddress"
                  >{{ isParsingPaste ? '识别中' : '提交' }}</button>
                </div>
              </div>
              </div>

              <div class="clipboard-bar" @click="togglePasteBoard">
                <span>地址粘贴板</span>
                <span class="clipboard-arrow" :class="{ expanded: showPasteBoard }"></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="sheet-footer">
        <button class="btn-primary" @click="confirmSheetAddress">确认</button>
      </div>
    </div>
  </transition>

  <transition name="slide-left-page">
    <div class="full-page" v-show="showLocationPicker">
      <div class="full-header">
        <div class="back-btn" @click="backToAddressSheet"></div>
        定位地址
      </div>

      <div class="search-wrap">
        <div class="search-row">
          <div class="city-name" @click="openCityPickerPage">{{ pickerCityText || '当前城市' }} ▾</div>
          <div class="search-box" @click="openSearchPage">
            <div class="search-icon"></div>
            <input
              class="search-input"
              :value="pickerKeyword"
              placeholder="输入小区/写字楼等"
              readonly
            />
          </div>
        </div>
      </div>

      <div class="map-area">
        <div ref="pickerMap" class="map-box-full"></div>
        <div class="center-marker-bubble" v-if="nearbyList.length && (nearbyList[0].title || nearbyList[0].address)">
          {{ nearbyList[0].title || nearbyList[0].address }}
        </div>
        <div class="center-marker-current-dot" :style="currentLocationMarkerStyle"></div>
        <div class="center-marker" :class="{ bouncing: isMarkerBouncing }"></div>
        <button
          type="button"
          ref="mapLocateBtn"
          class="map-locate-btn"
        ></button>
      </div>

      <div class="nearby-list">
        <div
          class="nearby-item"
          :class="{ 'active-item': index === 0 }"
          v-for="(item, index) in nearbyList"
          :key="'nearby-' + index"
          @click="chooseNearbyItem(item)"
        >
          <div class="nearby-left">
            <div class="nearby-icon" :class="index === 0 ? 'active' : 'normal'"></div>
            <div style="min-width:0; flex:1;">
              <div class="nearby-name">{{ item.title || '未知地点' }}</div>
              <div class="nearby-address">{{ item.address || '-' }}</div>
            </div>
          </div>
          <div class="nearby-distance" v-if="item.distanceText">{{ item.distanceText }}</div>
        </div>
      </div>
    </div>
  </transition>

  <transition name="slide-left-page">
    <div class="search-page" v-show="showSearchPage">
      <div class="search-page-header">
        <div class="search-back-btn" @click="closeSearchPage"></div>
        搜索地址
      </div>

      <div class="search-page-body">
        <div class="search-page-box-wrap">
          <div class="search-page-box">
            <div class="search-icon"></div>
            <input
              ref="searchInput"
              class="search-page-input"
              v-model.trim="searchPageKeyword"
              placeholder="输入小区/写字楼等"
              @input="onSearchPageInput"
            />
          </div>
        </div>

        <div class="search-result-list" v-if="searchResultList.length">
          <div
            class="search-item"
            v-for="(item, index) in searchResultList"
            :key="'search-' + index"
            @click="chooseSearchResult(item)"
          >
            <div class="search-item-left">
              <div class="search-item-icon"></div>
              <div style="min-width:0; flex:1;">
                <div class="search-item-name" v-html="highlightKeyword(item.title, searchPageKeyword)"></div>
                <div class="search-item-address">{{ item.address || '-' }}</div>
              </div>
            </div>
            <div class="search-item-distance" v-if="item.distanceText">{{ item.distanceText }}</div>
          </div>
        </div>

        <div class="search-empty" v-else>
          {{ searchPageKeyword ? '未搜索到相关地址' : '请输入关键词搜索地址' }}
        </div>

        <div class="search-tip-bottom">
          如果找不到地址，请尝试只输入小区、写字楼或学校名称，<br />
          门牌号可稍后输入。
        </div>
      </div>
    </div>
  </transition>

  <transition name="slide-left-page">
    <div class="city-picker-page" v-show="showCityPickerPage">
      <div class="city-picker-top">
        <div class="city-picker-search">
          <div class="search-icon"></div>
          <input
            ref="cityPickerInput"
            class="city-picker-input"
            v-model.trim="cityPickerKeyword"
            placeholder="输入城市名称进行搜索"
            @input="onCityPickerInput"
          />
        </div>
        <div class="city-picker-cancel" @click="closeCityPickerPage">取消</div>
      </div>

      <div class="city-picker-current-letter" v-if="cityPickerGroupedList.length">
        {{ cityPickerIndexActive || cityPickerLetterList[0] || '' }}
      </div>

      <div class="city-picker-body" ref="cityPickerListWrap" @scroll="handleCityPickerListScroll">
        <div class="city-picker-section">
          <div class="city-picker-section-title">当前定位城市</div>
          <div class="city-picker-current" @click="selectCityPickerItem(currentCityDisplayName)">
            <div class="city-picker-current-icon"></div>
            <div class="city-picker-current-name">{{ currentCityDisplayName || '未定位' }}</div>
          </div>
        </div>

        <div class="city-picker-list" v-if="cityPickerGroupedList.length">
          <div
            class="city-picker-group"
            v-for="group in cityPickerGroupedList"
            :key="'city-picker-group-' + group.letter"
            :data-letter="group.letter"
          >
            <div class="city-picker-group-letter">{{ group.letter }}</div>
            <div
              class="city-picker-item"
              v-for="(item, index) in group.list"
              :key="'city-picker-item-' + group.letter + '-' + index + '-' + item.name"
              @click="selectCityPickerItem(item.name)"
            >{{ item.name }}</div>
          </div>
        </div>

        <div class="city-picker-empty" v-else>未找到相关城市/地区</div>
      </div>

      <div class="city-picker-index" v-if="cityPickerLetterList.length">
        <span
          v-for="letter in cityPickerLetterList"
          :key="'city-picker-letter-' + letter"
          :class="{ active: cityPickerIndexActive === letter }"
          @click="scrollToCityPickerLetter(letter)"
        >{{ letter }}</span>
      </div>

      <div class="city-picker-letter-toast" v-if="cityPickerToastLetter">
        {{ cityPickerToastLetter }}
      </div>
    </div>
  </transition>

  <transition name="fade-mask">
    <div class="region-selector-mask" v-show="showRegionSelector">
      <transition name="slide-up-sheet">
        <div class="region-selector-panel" v-show="showRegionSelector">
          <div class="region-selector-header">
            <div class="region-top-tabs">
              <div
                class="region-top-tab"
                :class="{ active: regionSelectorTab === 'domestic' }"
                @click="switchRegionSelectorTab('domestic')"
              >中国境内</div>
              <div
                class="region-top-tab"
                :class="{ active: regionSelectorTab === 'oversea' }"
                @click="switchRegionSelectorTab('oversea')"
              >港澳台</div>
            </div>
            <div class="region-selector-close" @click="closeRegionSelector">×</div>
          </div>

          <div class="region-selector-body" v-if="regionSelectorTab === 'domestic'">
            <div class="region-selected-bar" v-if="regionSelectorCrumbs.length">
              <template v-for="(item, index) in regionSelectorCrumbs">
                <div
                  class="region-chip"
                  :class="{ active: isRegionChipActive(item.step) }"
                  :key="'domestic-chip-' + item.step"
                  @click="switchRegionStepView(item.step)"
                >{{ item.label }}</div>
                <div
                  class="region-chip-separator"
                  v-if="index < regionSelectorCrumbs.length - 1"
                  :key="'domestic-separator-' + item.step"
                >-</div>
              </template>
            </div>
            <template v-if="regionStep === 'province'">
              <div class="region-hot-block">
                <div class="region-block-title">热门城市</div>
                <div class="hot-city-grid">
                  <div
                    class="hot-city-item"
                    v-for="item in hotRegionList"
                    :key="'hot-' + item.city"
                    @click="selectHotCity(item)"
                  >
                    {{ item.city }}
                  </div>
                </div>
              </div>

              <div class="region-hot-block" style="padding-top:10px; padding-bottom:0;">
                <div class="region-block-title" style="margin-bottom:8px;">选择省份/地区</div>
              </div>

              <div class="region-list-wrap" ref="provinceListWrap" @scroll="handleRegionListScroll('province')">
                <div
                  class="region-group"
                  v-for="group in groupedProvinceList"
                  :key="'province-group-' + group.letter"
                  :data-letter="group.letter"
                >
                  <div class="region-group-letter">{{ group.letter }}</div>
                  <div class="region-group-items">
                    <div
                      class="region-list-item"
                      :class="{ active: regionTemp.province === item.name }"
                      v-for="item in group.list"
                      :key="'province-' + item.name"
                      @click="selectProvince(item.name)"
                    >
                      {{ item.name }}
                    </div>
                  </div>
                </div>

              </div>
              <div class="region-side-index">
                <span
                  v-for="letter in provinceLetterList"
                  :key="'p-index-' + letter"
                  :class="{ active: regionIndexActive.province === letter }"
                  @click="scrollToRegionLetter('province', letter)"
                >{{ letter }}</span>
              </div>
            </template>

            <template v-if="regionStep === 'city'">
              <div class="region-hot-block" style="padding-top:12px; padding-bottom:0;">
                <div class="region-block-title" style="margin-bottom:8px;">请选择</div>
              </div>

              <div class="region-list-wrap" ref="cityListWrap" @scroll="handleRegionListScroll('city')">
                <div
                  class="region-group"
                  v-for="group in groupedCityList"
                  :key="'city-group-' + group.letter"
                  :data-letter="group.letter"
                >
                  <div class="region-group-letter">{{ group.letter }}</div>
                  <div class="region-group-items">
                    <div
                      class="region-list-item"
                      :class="{ active: regionTemp.city === item.name }"
                      v-for="item in group.list"
                      :key="'city-' + item.name"
                      @click="selectCity(item.name)"
                    >
                      {{ item.name }}
                    </div>
                  </div>
                </div>

              </div>
              <div class="region-side-index">
                <span
                  v-for="letter in cityLetterList"
                  :key="'c-index-' + letter"
                  :class="{ active: regionIndexActive.city === letter }"
                  @click="scrollToRegionLetter('city', letter)"
                >{{ letter }}</span>
              </div>
            </template>

            <template v-if="regionStep === 'district'">
              <div class="region-hot-block" style="padding-top:12px; padding-bottom:0;">
                <div class="region-block-title" style="margin-bottom:8px;">请选择区县</div>
              </div>

              <div class="region-list-wrap" ref="districtListWrap" @scroll="handleRegionListScroll('district')">
                <div
                  class="region-group"
                  v-for="group in groupedDistrictList"
                  :key="'district-group-' + group.letter"
                  :data-letter="group.letter"
                >
                  <div class="region-group-letter">{{ group.letter }}</div>
                  <div class="region-group-items">
                    <div
                      class="region-list-item"
                      :class="{ active: regionTemp.district === item.name }"
                      v-for="item in group.list"
                      :key="'district-' + item.name"
                      @click="selectDistrict(item.name)"
                    >
                      {{ item.name }}
                    </div>
                  </div>
                </div>

              </div>
              <div class="region-side-index">
                <span
                  v-for="letter in districtLetterList"
                  :key="'d-index-' + letter"
                  :class="{ active: regionIndexActive.district === letter }"
                  @click="scrollToRegionLetter('district', letter)"
                >{{ letter }}</span>
              </div>
            </template>
          </div>

          <div class="region-selector-body" v-if="regionSelectorTab === 'oversea'">
            <div class="region-selected-bar" v-if="regionSelectorCrumbs.length">
              <template v-for="(item, index) in regionSelectorCrumbs">
                <div
                  class="region-chip"
                  :class="{ active: isRegionChipActive(item.step) }"
                  :key="'oversea-chip-' + item.step"
                  @click="switchRegionStepView(item.step)"
                >{{ item.label }}</div>
                <div
                  class="region-chip-separator"
                  v-if="index < regionSelectorCrumbs.length - 1"
                  :key="'oversea-separator-' + item.step"
                >-</div>
              </template>
            </div>
            <template v-if="regionStep === 'province'">
              <div class="region-hot-block" style="padding-top:12px; padding-bottom:0;">
                <div class="region-block-title" style="margin-bottom:8px;">选择地区</div>
              </div>

              <div class="region-list-wrap" ref="overseaProvinceListWrap" @scroll="handleRegionListScroll('overseaProvince')">
                <div
                  class="region-group"
                  v-for="group in groupedOverseaProvinceList"
                  :key="'oversea-province-group-' + group.letter"
                  :data-letter="group.letter"
                >
                  <div class="region-group-letter">{{ group.letter }}</div>
                  <div class="region-group-items">
                    <div
                      class="region-list-item"
                      :class="{ active: regionTemp.province === item.name }"
                      v-for="item in group.list"
                      :key="'oversea-province-' + item.name"
                      @click="selectProvince(item.name)"
                    >
                      {{ item.name }}
                    </div>
                  </div>
                </div>

              </div>
              <div class="region-side-index">
                <span
                  v-for="letter in overseaProvinceLetterList"
                  :key="'op-index-' + letter"
                  :class="{ active: regionIndexActive.overseaProvince === letter }"
                  @click="scrollToRegionLetter('overseaProvince', letter)"
                >{{ letter }}</span>
              </div>
            </template>

            <template v-if="regionStep === 'city'">
              <div class="region-hot-block" style="padding-top:12px; padding-bottom:0;">
                <div class="region-block-title" style="margin-bottom:8px;">请选择</div>
              </div>

              <div class="region-list-wrap" ref="cityListWrap" @scroll="handleRegionListScroll('city')">
                <div
                  class="region-group"
                  v-for="group in groupedCityList"
                  :key="'oversea-city-group-' + group.letter"
                  :data-letter="group.letter"
                >
                  <div class="region-group-letter">{{ group.letter }}</div>
                  <div class="region-group-items">
                    <div
                      class="region-list-item"
                      :class="{ active: regionTemp.city === item.name }"
                      v-for="item in group.list"
                      :key="'oversea-city-' + item.name"
                      @click="selectCity(item.name)"
                    >
                      {{ item.name }}
                    </div>
                  </div>
                </div>

              </div>
              <div class="region-side-index">
                <span
                  v-for="letter in cityLetterList"
                  :key="'oc-index-' + letter"
                  :class="{ active: regionIndexActive.city === letter }"
                  @click="scrollToRegionLetter('city', letter)"
                >{{ letter }}</span>
              </div>
            </template>

            <template v-if="regionStep === 'district'">
              <div class="region-hot-block" style="padding-top:12px; padding-bottom:0;">
                <div class="region-block-title" style="margin-bottom:8px;">请选择区县</div>
              </div>

              <div class="region-list-wrap" ref="districtListWrap" @scroll="handleRegionListScroll('district')">
                <div
                  class="region-group"
                  v-for="group in groupedDistrictList"
                  :key="'oversea-district-group-' + group.letter"
                  :data-letter="group.letter"
                >
                  <div class="region-group-letter">{{ group.letter }}</div>
                  <div class="region-group-items">
                    <div
                      class="region-list-item"
                      :class="{ active: regionTemp.district === item.name }"
                      v-for="item in group.list"
                      :key="'oversea-district-' + item.name"
                      @click="selectDistrict(item.name)"
                    >
                      {{ item.name }}
                    </div>
                  </div>
                </div>

              </div>
              <div class="region-side-index">
                <span
                  v-for="letter in districtLetterList"
                  :key="'od-index-' + letter"
                  :class="{ active: regionIndexActive.district === letter }"
                  @click="scrollToRegionLetter('district', letter)"
                >{{ letter }}</span>
              </div>
            </template>
          </div>
        </div>
      </transition>
    </div>
  </transition>

  <transition name="fade-mask">
    <div class="confirm-mask" v-show="showRiskConfirm">
      <div class="confirm-dialog">
        <div class="confirm-header">检测到地址异常</div>
        <div class="confirm-body">
          当前地址存在以下异常，请确认是否继续使用。
          <div class="confirm-list">
            <div v-for="(item, index) in addressRiskList" :key="'confirm-' + index">- {{ item }}</div>
          </div>
        </div>
        <div class="confirm-footer">
          <button class="confirm-btn cancel" @click="cancelRiskConfirm">返回修改</button>
          <button class="confirm-btn ok" @click="continueRiskConfirm">继续使用</button>
        </div>
      </div>
    </div>
  </transition>

  <transition name="fade-mask">
    <div class="confirm-mask" v-show="showPasteConfirm">
      <div class="confirm-dialog paste-confirm-dialog">
        <div class="paste-confirm-header">是否填入粘贴板的地址信息？</div>
        <div class="paste-confirm-body">
          <div class="paste-confirm-line">
            <span class="paste-confirm-label">所在地区：</span>
            <span class="paste-confirm-value">{{ pasteConfirmData.regionText || '-' }}</span>
          </div>
          <div class="paste-confirm-line">
            <span class="paste-confirm-label">详细地址：</span>
            <span class="paste-confirm-value">{{ pasteConfirmData.detailAddress || '-' }}</span>
          </div>
        </div>
        <div class="paste-confirm-footer">
          <button class="confirm-btn cancel" @click="cancelPasteConfirm">取消</button>
          <button class="confirm-btn ok" @click="confirmPasteSelection">确定</button>
        </div>
      </div>
    </div>
  </transition>

  <transition name="fade-mask">
    <div class="confirm-mask" v-show="showVantAlert">
      <div class="confirm-dialog vant-alert-dialog">
        <div class="vant-alert-header">{{ vantAlert.title }}</div>
        <div class="vant-alert-body">{{ vantAlert.message }}</div>
        <div class="vant-alert-footer">
          <button class="vant-alert-btn" @click="closeVantAlert">确定</button>
        </div>
      </div>
    </div>
  </transition>
</div>`
,
    // data 的返回值是组件内部的响应式状态，模板里展示的内容大多来自这里。
    data: function () {
      return {
        // 当前主标签页：map 表示地图选址，region 表示行政区选址。
        activeTab: 'map',
        // 弹层和页面显示状态：true 表示显示，false 表示隐藏。
        showAddressSheet: true,
        showLocationPicker: false,
        showSearchPage: false,
        showCityPickerPage: false,
        showRiskConfirm: false,
        showPasteConfirm: false,
        showVantAlert: false,
        showRegionSelector: false,
        showPasteBoard: false,
        // 操作状态：用于控制加载中、动画中、拖拽中等临时 UI 状态。
        isParsingPaste: false,
        isMarkerBouncing: false,
        isPickerMapDragging: false,
        markerBounceTimer: null,

        sheetProviceCityDistrict: '',

        // 百度地图服务实例：定位、逆地址解析、地图实例会存到这里复用。
        geolocation: null,
        geocoder: null,

        pickerMapInstance: null,
        pickerGeocoder: null,
        searchPageTimer: null,

        // 当前定位地址：浏览器定位成功后，会把坐标和省市区等信息存到这里。
        currentLocation: {
          point: null,
          title: '',
          name: '',
          address: '',
          province: '',
          city: '',
          district: '',
          street: '',
          streetNumber: ''
        },

        currentLocationMarkerStyle: {
          display: 'none',
          left: '50%',
          top: '50%'
        },

        // 当前已选地图地址：用户在地图或搜索结果中选中的地址会存到这里。
        selectedLocation: {
          point: null,
          title: '',
          name: '',
          address: '',
          province: '',
          city: '',
          district: '',
          street: '',
          streetNumber: ''
        },

        sheetAddressTitle: '',
        sheetAddressText: '',
        sheetDoorNumber: '',

        pasteText: '',

        pickerKeyword: '',
        pickerCityText: '',
        cityPickerKeyword: '',
        cityPickerIndexActive: '',
        cityPickerToastLetter: '',
        cityPickerToastTimer: null,
        nearbyList: [],

        searchPageKeyword: '',
        searchResultList: [],

        // 地址风险提示：当输入地址和地图识别结果不一致时，会把提示放到这里。
        addressRiskList: [],
        addressRiskText: '',
        riskConfirmed: false,

        pendingPayload: null,
        pendingPasteSelection: null,
        // 粘贴识别确认数据：用于弹窗展示识别到的地区和详细地址。
        pasteConfirmData: {
          regionText: '',
          detailAddress: ''
        },

        vantAlert: {
          title: '温馨提示',
          message: ''
        },

        regionDisplayText: '',
        // 地区选址表单：保存省、市、区和手动填写的详细地址。
        regionForm: {
          province: '',
          city: '',
          district: '',
          detailAddress: ''
        },

        regionSuggestList: [],
        regionSuggestTimer: null,

        regionSelectorTab: 'domestic',
        regionStep: 'province',
        // 地区选择器临时值：用户在弹窗里选择时先存在这里，确认后再写入 regionForm。
        regionTemp: {
          province: '',
          city: '',
          district: ''
        },
        regionIndexActive: {
          province: '',
          city: '',
          district: '',
          overseaProvince: ''
        },

        // 最终提交表单：确认地址时会把地图模式或地区模式的数据整理到这里。
        form: {
          province: '',
          city: '',
          district: '',
          street: '',
          streetNumber: '',
          fullAddress: '',
          detailAddress: '',
          lng: '',
          lat: ''
        }
      };
    },

    computed: {

      // 根据当前加载到的地区数据，返回组件可用的地区数据源。
      regionDataSource: function () {
        if (typeof cityData3 !== 'undefined' && Array.isArray(cityData3)) {
          return cityData3;
        }
        return [];
      },

      // 取出中国境内的省市区树形数据，供地区选择器使用。
      domesticRegionTree: function () {
        return this.regionDataSource.filter(function (item) {
          return ['71', '81', '82'].indexOf(String(item.value)) === -1;
        });
      },

      // 取出港澳台地区的树形数据，供地区选择器切换使用。
      overseaRegionTree: function () {
        return this.regionDataSource.filter(function (item) {
          return ['71', '81', '82'].indexOf(String(item.value)) > -1;
        });
      },

      // 把港澳台树形数据转换成列表，方便后续分组和展示。
      overseaRegionList: function () {
        return this.overseaRegionTree
          .map(function (item) {
            return item.text;
          });
      },

      // 生成热门城市列表，用户可以直接点选常用城市。
      hotRegionList: function () {
        const self = this;
        const hotConfig = [
          { city: '北京市', district: '朝阳区' },
          { city: '上海市', district: '浦东新区' },
          { city: '广州市', district: '天河区' },
          { city: '深圳市', district: '南山区' },
          { city: '杭州市', district: '西湖区' },
          { city: '南京市', district: '玄武区' },
          { city: '苏州市', district: '姑苏区' },
          { city: '天津市', district: '和平区' },
          { city: '武汉市', district: '武昌区' },
          { city: '长沙市', district: '岳麓区' }
        ];

        return hotConfig.map(function (item) {
          return self.findHotCitySelection(item);
        }).filter(Boolean);
      },

      // 按首字母把省份列表分组，用于右侧字母索引。
      groupedProvinceList: function () {
        let list = (this.domesticRegionTree || []).map(function (item) {
          return {
            name: item.text,
            letter: getLetter(item.text)
          };
        });
        return this.groupByLetter(list.sort(sortByLetterAndName));
      },

      // 提取省份分组中的字母列表，用于渲染侧边索引。
      provinceLetterList: function () {
        return this.groupedProvinceList.map(function (item) {
          return item.letter;
        });
      },

      // 按首字母把港澳台地区列表分组。
      groupedOverseaProvinceList: function () {
        let list = (this.overseaRegionTree || []).map(function (item) {
          return {
            name: item.text,
            letter: getLetter(item.text)
          };
        });
        return this.groupByLetter(list.sort(sortByLetterAndName));
      },

      // 提取港澳台地区分组中的字母索引。
      overseaProvinceLetterList: function () {
        return this.groupedOverseaProvinceList.map(function (item) {
          return item.letter;
        });
      },

      // 根据当前地区类型，返回境内或港澳台地区树。
      currentRegionTree: function () {
        return this.regionSelectorTab === 'oversea' ? this.overseaRegionTree : this.domesticRegionTree;
      },

      // 找到当前已选择的省份节点。
      currentProvinceNode: function () {
        return this.findProvinceNode(this.regionTemp.province);
      },

      // 根据当前省份，计算可以选择的城市列表。
      currentCityList: function () {
        const provinceNode = this.currentProvinceNode;
        if (!provinceNode) return [];

        const children = provinceNode.children || [];
        if (children.length === 1 && children[0].text === '市辖区') {
          return [{
            name: provinceNode.text,
            letter: getLetter(provinceNode.text)
          }];
        }

        let list = children.map(function (item) {
          return {
            name: item.text,
            letter: getLetter(item.text)
          };
        });
        return list.sort(sortByLetterAndName);
      },

      // 按首字母把城市列表分组。
      groupedCityList: function () {
        return this.groupByLetter(this.currentCityList);
      },

      // 提取城市分组里的字母索引。
      cityLetterList: function () {
        return this.groupedCityList.map(function (item) {
          return item.letter;
        });
      },

      // 根据当前城市，计算可以选择的区县列表。
      currentDistrictList: function () {
        const cityNode = this.findCityNode(this.regionTemp.province, this.regionTemp.city);
        if (!cityNode) return [];

        let list = (cityNode.children || []).map(function (item) {
          return {
            name: item.text,
            letter: getLetter(item.text)
          };
        });
        return list.sort(sortByLetterAndName);
      },

      // 按首字母把区县列表分组。
      groupedDistrictList: function () {
        return this.groupByLetter(this.currentDistrictList);
      },

      // 提取区县分组里的字母索引。
      districtLetterList: function () {
        return this.groupedDistrictList.map(function (item) {
          return item.letter;
        });
      },

      // 生成地区选择器顶部的已选路径，例如省、市、区。
      regionSelectorCrumbs: function () {
        let list = [];
        if (this.regionTemp.province) {
          list.push({
            step: 'province',
            label: this.regionTemp.province
          });
        }
        if (this.regionTemp.city && this.regionTemp.city !== '市辖区') {
          list.push({
            step: 'city',
            label: this.regionTemp.city
          });
        }
        if (this.regionTemp.district) {
          list.push({
            step: 'district',
            label: this.regionTemp.district
          });
        }
        return list;
      },

      // 计算当前定位城市在页面上的展示名称。
      currentCityDisplayName: function () {
        return this.normalizeCityPickerName(this.currentLocation.city || this.pickerCityText || '');
      },

      // 生成城市选择页面的完整城市数据源。
      cityPickerSourceList: function () {
        let result = [];
        const walk = function (list) {
          (list || []).forEach(function (item) {
            if (!item || !item.text) return;
            if (item.text !== '市辖区') {
              result.push({
                name: item.text,
                letter: getLetter(item.text)
              });
            }
            if (item.children && item.children.length) {
              walk(item.children);
            }
          });
        };

        walk(this.regionDataSource || []);
        return result.sort(sortByLetterAndName);
      },

      // 根据搜索关键词过滤城市选择列表。
      cityPickerFilteredList: function () {
        const keyword = (this.cityPickerKeyword || '').trim();
        if (!keyword) return this.cityPickerSourceList;

        return this.cityPickerSourceList.filter(function (item) {
          return item.name && item.name.indexOf(keyword) > -1;
        });
      },

      // 把城市选择列表按首字母分组。
      cityPickerGroupedList: function () {
        return this.groupByLetter(this.cityPickerFilteredList);
      },

      // 提取城市选择页右侧的字母索引。
      cityPickerLetterList: function () {
        return this.cityPickerGroupedList.map(function (item) {
          return item.letter;
        });
      },

      // 判断是否展示地区详细地址的联想结果。
      showRegionSuggest: function () {
        return this.activeTab === 'region' && this.regionSuggestList.length > 0 && !!this.regionForm.detailAddress;
      }
    },

    methods: {
      // 对外暴露 open 方法，父级可以通过组件实例手动打开地址选择器。
      open: function () {
        this.openAddressSheet();
      },

      // 对外暴露 close 方法，父级可以通过组件实例手动关闭地址选择器。
      close: function () {
        this.closeAddressSheet();
      },

      // 把带 letter 字段的列表整理成按字母分组的结构。
      groupByLetter: function (list) {
        const map = {};
        (list || []).forEach(function (item) {
          const letter = item.letter || '';
          if (!/^[A-Z]$/.test(letter)) return;
          if (!map[letter]) map[letter] = [];
          map[letter].push(item);
        });

        const letters = Object.keys(map).sort();
        return letters.map(function (letter) {
          return {
            letter: letter,
            list: map[letter]
          };
        });
      },

      // 根据地区层级类型，找到对应滚动容器的 ref 名称。
      getRegionListWrapRef: function (type) {
        const refMap = {
          province: 'provinceListWrap',
          city: 'cityListWrap',
          district: 'districtListWrap',
          overseaProvince: 'overseaProvinceListWrap'
        };
        return refMap[type] || '';
      },

      // 根据地区层级类型，拿到真实的滚动 DOM 容器。
      getRegionListWrap: function (type) {
        const refName = this.getRegionListWrapRef(type);
        const ref = refName ? this.$refs[refName] : null;
        if (!ref) return null;
        if (!Array.isArray(ref)) return ref;
        for (let i = 0; i < ref.length; i++) {
          if (ref[i] && ref[i].offsetParent !== null) {
            return ref[i];
          }
        }
        return ref[0] || null;
      },

      // 点击右侧字母索引时，滚动到对应地区分组。
      scrollToRegionLetter: function (type, letter) {
        const self = this;
        this.$nextTick(function () {
          const wrap = self.getRegionListWrap(type);
          if (!wrap) return;

          const target = wrap.querySelector('[data-letter="' + letter + '"]');
          if (!target) return;

          self.regionIndexActive[type] = letter;
          const wrapRect = wrap.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          wrap.scrollTop += targetRect.top - wrapRect.top;
        });
      },

      // 监听地区列表滚动，更新当前高亮的字母索引。
      handleRegionListScroll: function (type) {
        const wrap = this.getRegionListWrap(type);
        if (!wrap) return;

        const groups = wrap.querySelectorAll('.region-group[data-letter]');
        if (!groups || !groups.length) return;

        let activeLetter = '';
        for (let i = 0; i < groups.length; i++) {
          if (groups[i].offsetTop - wrap.scrollTop <= 12) {
            activeLetter = groups[i].getAttribute('data-letter') || '';
          } else {
            break;
          }
        }

        if (!activeLetter) {
          activeLetter = groups[0].getAttribute('data-letter') || '';
        }

        this.regionIndexActive[type] = activeLetter;
      },

      // 显示统一提示弹窗，用来给用户友好反馈。
      showAlert: function (message, title) {
        this.vantAlert = {
          title: title || '温馨提示',
          message: message || ''
        };
        this.showVantAlert = true;
      },

      // 关闭统一提示弹窗。
      closeVantAlert: function () {
        this.showVantAlert = false;
      },

      // 把城市名称做简化处理，便于搜索和匹配。
      normalizeCityPickerName: function (name) {
        let value = (name || '').trim();
        if (!value) return '';
        return value
          .replace(/特别行政区$/, '')
          .replace(/自治州$/, '')
          .replace(/地区$/, '')
          .replace(/盟$/, '')
          .replace(/市$/, '');
      },

      // 展开或收起地址粘贴板。
      togglePasteBoard: function () {
        this.showPasteBoard = !this.showPasteBoard;
      },

      // 切换主面板标签，支持地图选址和地区选址。
      switchMainTab: function (tab) {
        this.activeTab = tab;
        this.addressRiskList = [];
        this.addressRiskText = '';
        if (tab !== 'region') {
          this.clearRegionSuggest();
        }
      },

      // 清空粘贴板内容，并重置粘贴识别相关状态。
      clearPasteText: function () {
        this.pasteText = '';
        this.addressRiskList = [];
        this.addressRiskText = '';
        this.showPasteConfirm = false;
        this.pendingPasteSelection = null;
        this.pasteConfirmData = {
          regionText: '',
          detailAddress: ''
        };
      },

      // 清空地区详细地址的联想列表。
      clearRegionSuggest: function () {
        this.regionSuggestList = [];
      },

      // 清空地区选址里的详细地址输入框。
      clearRegionDetailInput: function () {
        this.regionForm.detailAddress = '';
        this.clearRegionSuggest();
      },

      // 监听详细地址输入，触发联想搜索或清空联想结果。
      onRegionDetailInput: function () {
        const self = this;
        if (this.regionSuggestTimer) {
          clearTimeout(this.regionSuggestTimer);
        }

        if (!this.regionDisplayText || !this.regionForm.detailAddress) {
          this.clearRegionSuggest();
          return;
        }

        this.regionSuggestTimer = setTimeout(function () {
          self.searchRegionSuggestions();
        }, 240);
      },

      // 根据已选省市区和输入内容，搜索详细地址联想结果。
      searchRegionSuggestions: function () {
        const self = this;
        this.initBaseServices();
        const keyword = (this.regionForm.detailAddress || '').trim();
        if (!keyword) {
          this.clearRegionSuggest();
          return;
        }

        const regionKeyword = this.getRegionParts(
          this.regionForm.province,
          this.regionForm.city,
          this.regionForm.district
        ).join('');

        if (!regionKeyword) {
          this.clearRegionSuggest();
          return;
        }

        const mapContext = this.pickerMapInstance || new BMapGL.Map(document.createElement('div'));
        const localSearch = new BMapGL.LocalSearch(mapContext, {
          pageCapacity: 6,
          onSearchComplete: function (results) {
            if (!results || localSearch.getStatus() !== 0) {
              self.clearRegionSuggest();
              return;
            }

            let list = [];
            const count = results.getCurrentNumPois();
            for (let i = 0; i < count; i++) {
              const poi = results.getPoi(i);
              if (!poi) continue;

              const province = self.formatProvinceName(poi.province || '');
              const city = poi.city || '';
              const district = poi.district || '';

              if (self.regionForm.province && province && province !== self.regionForm.province) continue;
              if (self.regionForm.city && self.regionForm.city !== '市辖区' && city && city !== self.regionForm.city) continue;
              if (self.regionForm.district && district && district !== self.regionForm.district) continue;

              list.push({
                title: poi.title || keyword,
                name: poi.title || keyword,
                address: poi.address || '',
                point: poi.point || null,
                province: province,
                city: city,
                district: district
              });
            }

            self.regionSuggestList = list;
          }
        });

        localSearch.search(regionKeyword + keyword);
      },

      // 选择一条详细地址联想结果，并回填到表单。
      selectRegionSuggestion: function (item) {
        if (!item) return;
        this.regionForm.detailAddress = item.title || item.name || this.regionForm.detailAddress;
        this.clearRegionSuggest();
      },

      // 初始化百度地图基础服务，例如定位和逆地址解析。
      initBaseServices: function () {
        if (typeof BMapGL === 'undefined') {
          this.showAlert('百度地图加载失败');
          return;
        }
        if (!this.geolocation) {
          this.geolocation = new BMapGL.Geolocation();
        }
        if (!this.geocoder) {
          this.geocoder = new BMapGL.Geocoder();
        }
      },

      // 打开地址选择底部面板，并准备基础地图服务。
      openAddressSheet: function () {
        this.showAddressSheet = true;
        this.initBaseServices();
        this.fetchCurrentLocation();
      },

      // 关闭地址选择底部面板。
      closeAddressSheet: function () {
        this.showAddressSheet = false;
      },

      // 处理地图定位按钮事件，可选择是否重新回到当前位置。
      handleMapLocateButtonEvent: function (e, shouldRecenter) {
        if (e) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
        }
        if (shouldRecenter) {
          this.recenterToCurrentLocation();
        }
        return false;
      },

      // 给地图定位按钮绑定点击和触摸事件。
      bindMapLocateButton: function () {
        const self = this;
        this.$nextTick(function () {
          const btn = self.$refs.mapLocateBtn;
          if (!btn) return;

          btn.onclick = function (e) {
            return self.handleMapLocateButtonEvent(e, true);
          };
          btn.onmouseup = function (e) {
            return self.handleMapLocateButtonEvent(e, false);
          };
          btn.onmousedown = function (e) {
            return self.handleMapLocateButtonEvent(e, false);
          };
          btn.onpointerdown = function (e) {
            return self.handleMapLocateButtonEvent(e, false);
          };
          btn.onpointerup = function (e) {
            return self.handleMapLocateButtonEvent(e, true);
          };
          btn.ontouchstart = function (e) {
            return self.handleMapLocateButtonEvent(e, false);
          };
          btn.ontouchend = function (e) {
            return self.handleMapLocateButtonEvent(e, true);
          };
        });
      },

      // 触发地图中心标记的弹跳动画。
      triggerMarkerBounce: function () {
        const self = this;
        this.isMarkerBouncing = false;

        if (this.markerBounceTimer) {
          clearTimeout(this.markerBounceTimer);
        }

        this.$nextTick(function () {
          self.isMarkerBouncing = true;
          self.markerBounceTimer = setTimeout(function () {
            self.isMarkerBouncing = false;
            self.markerBounceTimer = null;
          }, 760);
        });
      },

      // 打开城市选择页面，并初始化搜索状态。
      openCityPickerPage: function () {
        this.showCityPickerPage = true;
        this.cityPickerKeyword = '';
        this.cityPickerIndexActive = this.cityPickerLetterList[0] || '';
        const self = this;
        this.$nextTick(function () {
          if (self.$refs.cityPickerInput) {
            self.$refs.cityPickerInput.focus();
          }
          self.handleCityPickerListScroll();
        });
      },

      // 关闭城市选择页面。
      closeCityPickerPage: function () {
        this.showCityPickerPage = false;
      },

      // 监听城市搜索输入，并更新字母索引状态。
      onCityPickerInput: function () {
        const self = this;
        this.$nextTick(function () {
          const wrap = self.$refs.cityPickerListWrap;
          if (wrap) {
            wrap.scrollTop = 0;
          }
          self.cityPickerIndexActive = self.cityPickerLetterList[0] || '';
        });
      },

      // 点击字母索引时显示当前字母提示。
      showCityPickerLetterToast: function (letter) {
        if (!letter) return;

        this.cityPickerToastLetter = letter;
        if (this.cityPickerToastTimer) {
          clearTimeout(this.cityPickerToastTimer);
        }

        const self = this;
        this.cityPickerToastTimer = setTimeout(function () {
          self.cityPickerToastLetter = '';
          self.cityPickerToastTimer = null;
        }, 1500);
      },

      // 城市选择页点击字母后滚动到对应分组。
      scrollToCityPickerLetter: function (letter) {
        const self = this;
        this.$nextTick(function () {
          const wrap = self.$refs.cityPickerListWrap;
          if (!wrap || !letter) return;

          self.showCityPickerLetterToast(letter);
          const target = wrap.querySelector('[data-letter="' + letter + '"]');
          if (!target) return;

          self.cityPickerIndexActive = letter;
          const wrapRect = wrap.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          wrap.scrollTop += targetRect.top - wrapRect.top;
        });
      },

      // 监听城市列表滚动，实时更新当前字母。
      handleCityPickerListScroll: function () {
        const wrap = this.$refs.cityPickerListWrap;
        if (!wrap) return;

        const groups = wrap.querySelectorAll('.city-picker-group[data-letter]');
        if (!groups || !groups.length) return;

        let activeLetter = '';
        for (let i = 0; i < groups.length; i++) {
          if (groups[i].offsetTop - wrap.scrollTop <= 12) {
            activeLetter = groups[i].getAttribute('data-letter') || '';
          } else {
            break;
          }
        }

        if (!activeLetter) {
          activeLetter = groups[0].getAttribute('data-letter') || '';
        }

        this.cityPickerIndexActive = activeLetter;
      },

      // 选择城市后关闭城市页，并让地图切换到该城市。
      selectCityPickerItem: function (name) {
        let value = (name || '').trim();
        if (!value) return;

        this.pickerCityText = value;
        this.showCityPickerPage = false;
        this.searchPageKeyword = '';
        this.searchResultList = [];
        this.pickerKeyword = '';
        this.centerPickerMapToCity(value);
      },

      // 根据城市名称把地图中心移动到对应城市。
      centerPickerMapToCity: function (name) {
        const self = this;
        if (!name) return;

        this.initBaseServices();
        if (!this.pickerMapInstance) return;

        if (this.geocoder && typeof this.geocoder.getPoint === 'function') {
          this.geocoder.getPoint(name, function (point) {
            if (!point) return;
            self.pickerMapInstance.centerAndZoom(point, 12);
            self.loadNearbyByCenter();
          }, name);
        }
      },

      // 根据当前位置坐标，更新地图上的当前位置标记样式。
      updateCurrentLocationMarker: function () {
        if (!this.pickerMapInstance || !this.currentLocation || !this.currentLocation.point) {
          this.currentLocationMarkerStyle.display = 'none';
          return;
        }

        try {
          const pixel = this.pickerMapInstance.pointToPixel(this.currentLocation.point);
          const size = this.pickerMapInstance.getSize ? this.pickerMapInstance.getSize() : null;

          if (!pixel || !size || pixel.x < -40 || pixel.y < -40 || pixel.x > size.width + 40 || pixel.y > size.height + 40) {
            this.currentLocationMarkerStyle.display = 'none';
            return;
          }

          this.currentLocationMarkerStyle = {
            display: 'block',
            left: pixel.x + 'px',
            top: pixel.y + 'px'
          };
        } catch (e) {
          this.currentLocationMarkerStyle.display = 'none';
        }
      },

      // 获取用户当前位置，并把定位结果转成可展示的地址。
      fetchCurrentLocation: function () {
        const self = this;
        if (!this.geolocation) return;

        this.geolocation.getCurrentPosition(function (r) {
          if (this.getStatus && this.getStatus() === 0 && r && r.point) {
            self.reversePointToAddress(r.point, function (data) {
              self.currentLocation = data;
              self.updateCurrentLocationMarker();

              if (!self.selectedLocation.point && !self.selectedLocation.address) {
                self.selectedLocation = JSON.parse(JSON.stringify(data));
                self.sheetAddressText = data.address || '';
              }
            });
          } else {
            self.currentLocation.name = '定位失败';
            self.currentLocation.address = '请点击右侧地图图标手动选择地址';
          }
        }, {
          enableHighAccuracy: true
        });
      },

      // 把地图坐标反查成省市区、街道和详细地址。
      reversePointToAddress: function (point, callback) {
        if (!this.geocoder || !point) return;
        const self = this;

        this.geocoder.getLocation(point, function (rs) {
          if (!rs) return;

          const ac = rs.addressComponents || {};
          const firstPoi = rs.surroundingPois && rs.surroundingPois[0] ? rs.surroundingPois[0] : null;

          const data = {
            point: point,
            title: firstPoi ? firstPoi.title : (ac.street || '当前位置'),
            name: firstPoi ? firstPoi.title : (ac.street || '当前位置'),
            address: rs.address || '',
            province: self.formatProvinceName(ac.province || ''),
            city: ac.city || '',
            district: ac.district || '',
            street: ac.street || '',
            streetNumber: ac.streetNumber || ''
          };

          if (callback) callback(data);
        });
      },

      // 把当前定位结果作为选中的地址使用。
      useCurrentLocation: function () {
        if (!this.currentLocation.point) {
          this.showAlert('当前位置还未获取成功');
          return;
        }

        this.applyMapLocationToSheet(JSON.parse(JSON.stringify(this.currentLocation)));
        this.addressRiskList = [];
        this.addressRiskText = '';
        this.riskConfirmed = false;
        this.activeTab = 'map';
      },

      // 把地图选中的位置回填到底部地址面板。
      applyMapLocationToSheet: function (location) {
        const province = location && location.province ? location.province : '';
        const city = location && location.city ? location.city : '';
        const district = location && location.district ? location.district : '';
        const address = location && location.address ? location.address : '';
        const name = location && location.name ? location.name : '';
        const title = location && location.title ? location.title : '';

        this.selectedLocation = Object.assign({
          point: null,
          title: '',
          name: '',
          address: '',
          province: '',
          city: '',
          district: '',
          street: '',
          streetNumber: ''
        }, location || {});

        this.selectedLocation.province = this.formatProvinceName(this.selectedLocation.province);

        this.sheetAddressTitle = title || name || '';
        this.sheetAddressText = address;
        this.sheetProviceCityDistrict = [this.selectedLocation.province, city, district].filter(Boolean).join(' ');
      },

      // 打开地图选址全屏页，并初始化地图。
      openLocationPicker: function () {
        const self = this;
        this.showLocationPicker = true;

        this.$nextTick(function () {
          self.bindMapLocateButton();
          self.initPickerMap();
        });
      },

      // 从地图选址页返回地址面板。
      backToAddressSheet: function () {
        this.showLocationPicker = false;
      },

      // 初始化地图选址页的百度地图实例和地图事件。
      initPickerMap: function () {
        const self = this;
        const mapEl = this.$refs.pickerMap;
        if (!mapEl) return;

        if (!this.pickerGeocoder) {
          this.pickerGeocoder = new BMapGL.Geocoder();
        }

        if (!this.pickerMapInstance) {
          this.pickerMapInstance = new BMapGL.Map(mapEl);
          const defaultPoint = new BMapGL.Point(116.404, 39.915);
          this.pickerMapInstance.centerAndZoom(defaultPoint, 16);
          this.pickerMapInstance.enableScrollWheelZoom(true);

          this.pickerMapInstance.addEventListener('moveend', function () {
            self.loadNearbyByCenter();
            self.updateCurrentLocationMarker();
            if (self.isPickerMapDragging) {
              self.isPickerMapDragging = false;
              self.triggerMarkerBounce();
            }
          });

          this.pickerMapInstance.addEventListener('moving', function () {
            self.isPickerMapDragging = true;
            self.updateCurrentLocationMarker();
          });

          this.pickerMapInstance.addEventListener('zoomend', function () {
            self.loadNearbyByCenter();
            self.updateCurrentLocationMarker();
          });
        } else if (typeof this.pickerMapInstance.checkResize === 'function') {
          this.pickerMapInstance.checkResize();
        }

        const targetPoint = this.currentLocation.point || this.selectedLocation.point;
        if (targetPoint) {
          this.pickerMapInstance.centerAndZoom(targetPoint, 18);
          this.loadNearbyByCenter();
          this.$nextTick(function () {
            self.updateCurrentLocationMarker();
          });
        } else {
          this.fetchCurrentLocationForPicker();
        }
      },

      // 进入地图选址页后重新定位，并加载附近地址。
      fetchCurrentLocationForPicker: function () {
        const self = this;
        if (!this.geolocation) return;

        this.geolocation.getCurrentPosition(function (r) {
          if (this.getStatus && this.getStatus() === 0 && r && r.point) {
            self.pickerMapInstance.centerAndZoom(r.point, 18);
            self.loadNearbyByCenter();
            if (self.currentLocation && self.currentLocation.point) {
              self.updateCurrentLocationMarker();
            } else {
              self.reversePointToAddress(r.point, function (data) {
                self.currentLocation = data;
                self.updateCurrentLocationMarker();
              });
            }
          }
        }, {
          enableHighAccuracy: true
        });
      },

      // 把地图重新移动到当前定位位置。
      recenterToCurrentLocation: function () {
        if (!this.pickerMapInstance) return;

        if (this.currentLocation && this.currentLocation.point) {
          try {
            if (typeof this.pickerMapInstance.panTo === 'function') {
              this.pickerMapInstance.panTo(this.currentLocation.point);
            } else {
              this.pickerMapInstance.centerAndZoom(this.currentLocation.point, 18);
            }

            if (typeof this.pickerMapInstance.setZoom === 'function') {
              this.pickerMapInstance.setZoom(18);
            }
          } catch (e) {
            this.pickerMapInstance.centerAndZoom(this.currentLocation.point, 18);
          }

          // 保存当前组件实例，避免 setTimeout 普通函数里的 this 指向发生变化。
          const self = this;
          setTimeout(function () {
            // 地图移动到当前位置后，重新加载附近地点，并更新中心点标记位置。
            self.loadNearbyByCenter();
            self.updateCurrentLocationMarker();
          }, 260);
          return;
        }

        this.fetchCurrentLocationForPicker();
      },

      // 根据地图中心点加载附近 POI 地址列表。
      loadNearbyByCenter: function () {
        const self = this;
        if (!this.pickerMapInstance || !this.pickerGeocoder) return;

        const center = this.pickerMapInstance.getCenter();
        if (!center) return;

        this.pickerGeocoder.getLocation(center, function (rs) {
          if (!rs) return;

          const ac = rs.addressComponents || {};
          self.pickerCityText = ac.city || ac.province || '当前城市';

          let list = [];
          const pois = rs.surroundingPois || [];

          list.push({
            point: center,
            title: (pois[0] && pois[0].title) || (ac.street || '当前位置'),
            address: rs.address || '',
            province: self.formatProvinceName(ac.province || ''),
            city: ac.city || '',
            district: ac.district || '',
            street: ac.street || '',
            streetNumber: ac.streetNumber || '',
            distanceText: ''
          });

          for (let i = 0; i < pois.length; i++) {
            const item = pois[i];
            if (!item || !item.point) continue;

            list.push({
              point: item.point,
              title: item.title || '',
              address: item.address || rs.address || '',
              province: self.formatProvinceName(ac.province || ''),
              city: ac.city || '',
              district: ac.district || '',
              street: ac.street || '',
              streetNumber: ac.streetNumber || '',
              distanceText: self.calcDistanceText(center, item.point)
            });
          }

          self.nearbyList = list;
        });
      },

      // 计算两个坐标点之间的距离展示文本。
      calcDistanceText: function (p1, p2) {
        try {
          const rad = function (d) {
            return d * Math.PI / 180;
          };
          const R = 6378137;
          const dLat = rad(p2.lat - p1.lat);
          const dLng = rad(p2.lng - p1.lng);
          const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(rad(p1.lat)) * Math.cos(rad(p2.lat)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const d = Math.round(R * c);
          return d < 1000 ? (d + 'm') : ((d / 1000).toFixed(1) + 'km');
        } catch (e) {
          return '';
        }
      },

      // 选择附近地址列表中的一项，并回填为当前地图地址。
      chooseNearbyItem: function (item) {
        if (!item || !item.point) return;

        this.applyMapLocationToSheet({
          point: item.point,
          title: item.title || '',
          name: item.title || '',
          address: item.address || '',
          province: item.province || '',
          city: item.city || '',
          district: item.district || '',
          street: item.street || '',
          streetNumber: item.streetNumber || ''
        });
        this.addressRiskList = [];
        this.addressRiskText = '';
        this.riskConfirmed = false;
        this.showLocationPicker = false;
        this.showSearchPage = false;
        this.activeTab = 'map';
      },

      // 打开地址搜索页，并自动聚焦搜索输入框。
      openSearchPage: function () {
        this.showSearchPage = true;
        this.searchPageKeyword = this.pickerKeyword || '';
        this.searchResultList = [];
        const self = this;
        this.$nextTick(function () {
          if (self.$refs.searchInput) {
            self.$refs.searchInput.focus();
          }
          if (self.searchPageKeyword) {
            self.searchAddress(self.searchPageKeyword, function (list) {
              self.searchResultList = list;
            });
          }
        });
      },

      // 关闭地址搜索页。
      closeSearchPage: function () {
        this.showSearchPage = false;
      },

      // 监听地址搜索输入，做防抖后发起搜索。
      onSearchPageInput: function () {
        const self = this;
        if (this.searchPageTimer) clearTimeout(this.searchPageTimer);

        if (!this.searchPageKeyword) {
          this.searchResultList = [];
          return;
        }

        this.searchPageTimer = setTimeout(function () {
          self.searchAddress(self.searchPageKeyword, function (list) {
            self.searchResultList = list;
          });
        }, 300);
      },

      // 调用百度地图本地搜索，根据关键词查找地址。
      searchAddress: function (keyword, callback) {
        const self = this;
        if (!keyword || !this.pickerMapInstance) {
          callback([]);
          return;
        }

        const localSearch = new BMapGL.LocalSearch(this.pickerMapInstance, {
          pageCapacity: 20,
          onSearchComplete: function (results) {
            if (!results || localSearch.getStatus() !== 0) {
              callback([]);
              return;
            }

            let list = [];
            const count = results.getCurrentNumPois();
            const center = self.pickerMapInstance.getCenter();

            for (let i = 0; i < count; i++) {
              const poi = results.getPoi(i);
              if (!poi || !poi.point) continue;

              list.push({
                point: poi.point,
                title: poi.title || '',
                address: poi.address || '',
                province: self.formatProvinceName(poi.province || ''),
                city: poi.city || '',
                district: poi.district || '',
                street: '',
                streetNumber: '',
                distanceText: center ? self.calcDistanceText(center, poi.point) : ''
              });
            }

            callback(list);
          }
        });

        localSearch.search(keyword);
      },

      // 选择搜索结果，并把地图移动到对应位置。
      chooseSearchResult: function (item) {
        const self = this;
        this.pickerKeyword = item.title || '';

        if (!item || !item.point) {
          this.chooseNearbyItem(item);
          return;
        }

        this.reversePointToAddress(item.point, function (data) {
          const merged = Object.assign({}, item, data || {});
          merged.title = item.title || merged.title || '';
          merged.name = item.title || merged.name || '';
          merged.address = item.address || merged.address || '';
          self.chooseNearbyItem(merged);
        });
      },

      // 把搜索结果里的关键词高亮显示。
      highlightKeyword: function (text, keyword) {
        if (!text) return '';
        if (!keyword) return this.escapeHtml(text);

        const safeText = this.escapeHtml(text);
        const safeKeyword = this.escapeReg(keyword);
        return safeText.replace(new RegExp('(' + safeKeyword + ')', 'ig'), '<span class="match-text">$1</span>');
      },

      // 转义 HTML 特殊字符，避免把用户输入当作标签渲染。
      escapeHtml: function (str) {
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      },

      // 转义正则特殊字符，避免关键词生成正则时报错。
      escapeReg: function (str) {
        return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      },

      // 把省份简称补全成标准名称，例如北京转为北京市。
      formatProvinceName: function (name) {
        let value = (name || '').trim();
        if (!value) return '';

        const provinceMap = {
          '北京': '北京市',
          '天津': '天津市',
          '上海': '上海市',
          '重庆': '重庆市',
          '内蒙古': '内蒙古自治区',
          '广西': '广西壮族自治区',
          '西藏': '西藏自治区',
          '宁夏': '宁夏回族自治区',
          '新疆': '新疆维吾尔自治区',
          '香港': '香港特别行政区',
          '澳门': '澳门特别行政区',
          '台湾': '台湾省'
        };

        if (provinceMap[value]) {
          return provinceMap[value];
        }

        if (/省|市|自治区|特别行政区$/.test(value)) {
          return value;
        }

        return value + '省';
      },

      // 把省、市、区整理成展示用的地址层级数组。
      getRegionParts: function (province, city, district) {
        let parts = [];
        const fullProvince = this.formatProvinceName(province || '');
        const cityName = city || '';
        const districtName = district || '';

        if (fullProvince) {
          parts.push(fullProvince);
        }

        if (cityName && cityName !== fullProvince && cityName !== '市辖区') {
          parts.push(cityName);
        }

        if (districtName) {
          parts.push(districtName);
        }

        return parts;
      },

      // 把标准省份名转成选择器里使用的简称。
      getProvinceSelectorValue: function (name) {
        let value = (name || '').trim();
        if (!value) return '';

        const reverseProvinceMap = {
          '北京市': '北京',
          '天津市': '天津',
          '上海市': '上海',
          '重庆市': '重庆',
          '内蒙古自治区': '内蒙古',
          '广西壮族自治区': '广西',
          '西藏自治区': '西藏',
          '宁夏回族自治区': '宁夏',
          '新疆维吾尔自治区': '新疆',
          '香港特别行政区': '香港',
          '澳门特别行政区': '澳门',
          '台湾省': '台湾'
        };

        if (reverseProvinceMap[value]) {
          return reverseProvinceMap[value];
        }

        return value.replace(/省$/, '');
      },

      // 在地区树中查找指定省份节点。
      findProvinceNode: function (name) {
        const fullName = this.formatProvinceName(name);
        const list = this.currentRegionTree || [];

        for (let i = 0; i < list.length; i++) {
          if (list[i].text === fullName) {
            return list[i];
          }
        }

        return null;
      },

      // 在指定省份下查找城市节点。
      findCityNode: function (provinceName, cityName) {
        const provinceNode = this.findProvinceNode(provinceName);
        if (!provinceNode) return null;

        const children = provinceNode.children || [];
        if (children.length === 1 && children[0].text === '市辖区' && cityName === provinceNode.text) {
          return children[0];
        }

        for (let i = 0; i < children.length; i++) {
          if (children[i].text === cityName) {
            return children[i];
          }
        }

        return null;
      },

      // 根据热门城市配置，找到对应省市区选择结果。
      findHotCitySelection: function (config) {
        const list = this.domesticRegionTree || [];

        for (let i = 0; i < list.length; i++) {
          const provinceNode = list[i];
          const children = provinceNode.children || [];

          if (children.length === 1 && children[0].text === '市辖区' && provinceNode.text === config.city) {
            return {
              province: provinceNode.text,
              city: provinceNode.text,
              district: config.district || ''
            };
          }

          for (let j = 0; j < children.length; j++) {
            if (children[j].text === config.city) {
              return {
                province: provinceNode.text,
                city: children[j].text,
                district: config.district || ''
              };
            }
          }
        }

        return null;
      },

      // 打开地区选择器，并同步当前已选择的地区状态。
      openRegionSelector: function () {
        this.showRegionSelector = true;
        this.regionSelectorTab = this.overseaRegionList.indexOf(this.regionForm.province) > -1 ? 'oversea' : 'domestic';

        this.regionTemp = {
          province: this.regionForm.province || '',
          city: this.regionForm.city || '',
          district: this.regionForm.district || ''
        };

        if (this.regionTemp.province && this.regionTemp.city) {
          if (this.regionTemp.district) {
            this.regionStep = 'district';
          } else {
            this.regionStep = 'city';
          }
        } else {
          this.regionStep = 'province';
        }

        const self = this;
        this.$nextTick(function () {
          const indexType = self.regionSelectorTab === 'oversea' ? 'overseaProvince' : self.regionStep;
          self.handleRegionListScroll(indexType);
        });
      },

      // 关闭地区选择器。
      closeRegionSelector: function () {
        this.showRegionSelector = false;
      },

      // 判断顶部地区路径标签是否为当前步骤。
      isRegionChipActive: function (step) {
        return this.regionStep === step;
      },

      // 点击顶部地区路径时切换到对应选择步骤。
      switchRegionStepView: function (step) {
        if (!step) return;
        if (step === 'city' && !this.regionTemp.city) return;
        if (step === 'district' && !this.regionTemp.district) return;

        this.regionStep = step;
        const self = this;
        this.$nextTick(function () {
          let indexType = step;
          if (step === 'province' && self.regionSelectorTab === 'oversea') {
            indexType = 'overseaProvince';
          }
          self.handleRegionListScroll(indexType);
        });
      },

      // 切换地区选择器的境内和港澳台标签。
      switchRegionSelectorTab: function (tab) {
        this.regionSelectorTab = tab;
        this.regionTemp = {
          province: '',
          city: '',
          district: ''
        };
        this.regionStep = 'province';
        const self = this;
        this.$nextTick(function () {
          self.handleRegionListScroll(tab === 'oversea' ? 'overseaProvince' : 'province');
        });
      },

      // 选择热门城市，并直接进入对应的地区层级。
      selectHotCity: function (item) {
        this.regionTemp.province = item.province;
        this.regionTemp.city = item.city;
        this.regionTemp.district = item.district || '';
        this.applyRegionSelection();
      },

      // 选择省份，并进入城市或区县选择步骤。
      selectProvince: function (name) {
        this.regionTemp.province = name;
        this.regionTemp.city = '';
        this.regionTemp.district = '';
        const provinceNode = this.findProvinceNode(name);
        const children = provinceNode && provinceNode.children ? provinceNode.children : [];

        if (!children.length) {
          this.applyRegionSelection();
          return;
        }

        if (children.length === 1 && children[0].text === '市辖区') {
          this.regionTemp.city = '市辖区';
          this.regionStep = 'district';
          const self = this;
          this.$nextTick(function () {
            self.handleRegionListScroll('district');
          });
          return;
        }

        this.regionStep = 'city';
        const self = this;
        this.$nextTick(function () {
          self.handleRegionListScroll('city');
        });
      },

      // 选择城市，并进入区县选择步骤。
      selectCity: function (name) {
        this.regionTemp.city = name;
        this.regionTemp.district = '';

        const cityNode = this.findCityNode(this.regionTemp.province, name);
        const districtList = cityNode && cityNode.children ? cityNode.children : [];
        if (districtList.length) {
          this.regionStep = 'district';
          const self = this;
          this.$nextTick(function () {
            self.handleRegionListScroll('district');
          });
        } else {
          this.applyRegionSelection();
        }
      },

      // 选择区县，并把完整地区结果应用到表单。
      selectDistrict: function (name) {
        this.regionTemp.district = name;
        this.applyRegionSelection();
      },

      // 把临时选择的省市区写入正式表单展示。
      applyRegionSelection: function () {
        this.regionForm.province = this.formatProvinceName(this.regionTemp.province || '');
        this.regionForm.city = this.regionTemp.city || '';
        this.regionForm.district = this.regionTemp.district || '';
        this.regionDisplayText = this.getRegionParts(
          this.regionForm.province,
          this.regionForm.city,
          this.regionForm.district
        ).join(' ');
        this.clearRegionSuggest();
        this.showRegionSelector = false;
        this.activeTab = 'region';
      },

      // 拼接地区选址模式下的完整地址。
      composeRegionFullAddress: function () {
        const region = this.getRegionParts(this.regionForm.province, this.regionForm.city, this.regionForm.district).join('');
        return (region || '') + (this.regionForm.detailAddress || '');
      },

      // 解析用户粘贴的地址文本，并尝试自动识别省市区和详细地址。
      parsePastedAddress: function () {
        const self = this;
        const text = (this.pasteText || '').trim();
        this.initBaseServices();
        this.isParsingPaste = true;

        this.addressRiskList = [];
        this.addressRiskText = '';
        this.riskConfirmed = false;
        this.showPasteConfirm = false;
        this.pendingPasteSelection = null;

        if (!text) {
          this.isParsingPaste = false;
          this.showAlert('请先粘贴地址内容');
          return;
        }

        const cleaned = this.cleanAddressText(text);
        const parsed = this.simpleParseAddress(cleaned);

        if (this.isRegionOnlyPaste(cleaned, parsed)) {
          this.handleRegionOnlyPaste(cleaned, parsed);
          return;
        }

        if (!this.geocoder) {
          const fallbackLocation = {
            point: null,
            title: parsed.name || parsed.detail || '已识别地址',
            name: parsed.name || parsed.detail || '已识别地址',
            address: cleaned,
            province: parsed.province || '',
            city: parsed.city || '',
            district: parsed.district || '',
            street: parsed.street || '',
            streetNumber: parsed.streetNumber || ''
          };
          const fallbackCandidate = this.buildPasteSelectionCandidate(cleaned, parsed, fallbackLocation);
          this.validateAddressRisk(cleaned, parsed, fallbackLocation);
          this.isParsingPaste = false;
          this.openPasteConfirm(fallbackCandidate);
          return;
        }

        this.searchAddressByText(cleaned, function (result) {
          let finalLocation;
          if (result) {
            finalLocation = {
              point: result.point,
              title: self.buildSearchDisplayTitle(parsed, result),
              name: self.buildSearchDisplayTitle(parsed, result),
              address: result.address || cleaned,
              province: result.province || parsed.province || '',
              city: result.city || parsed.city || '',
              district: result.district || parsed.district || '',
              street: result.street || parsed.street || '',
              streetNumber: result.streetNumber || parsed.streetNumber || ''
            };

            if (self.pickerMapInstance && result.point) {
              self.pickerMapInstance.centerAndZoom(result.point, 18);
            }
          } else {
            finalLocation = {
              point: null,
              title: parsed.name || parsed.detail || '已识别地址',
              name: parsed.name || parsed.detail || '已识别地址',
              address: cleaned,
              province: parsed.province || '',
              city: parsed.city || '',
              district: parsed.district || '',
              street: parsed.street || '',
              streetNumber: parsed.streetNumber || ''
            };
          }

          const candidate = self.buildPasteSelectionCandidate(cleaned, parsed, finalLocation);
          self.validateAddressRisk(cleaned, parsed, finalLocation);
          self.isParsingPaste = false;
          self.openPasteConfirm(candidate);
        });
      },

      // 判断粘贴内容是否只有省市区，没有详细门牌信息。
      isRegionOnlyPaste: function (cleaned, parsed) {
        if (!cleaned || !parsed) return false;

        const hasRegionInfo = !!(parsed.province || parsed.city || parsed.district);
        if (!hasRegionInfo) return false;

        const hasDetailInfo = !!(parsed.street || parsed.streetNumber || this.extractDoorNumber(parsed));
        if (hasDetailInfo) return false;

        const normalizedText = String(cleaned).replace(/\s+/g, '');
        const normalizedRegion = [
          parsed.province || '',
          parsed.city || '',
          parsed.district || ''
        ].join('').replace(/\s+/g, '');

        return normalizedText === normalizedRegion;
      },

      // 处理只包含地区信息的粘贴内容。
      handleRegionOnlyPaste: function (cleaned, parsed) {
        const self = this;

        const applyRegion = function (province, city, district, riskLocation) {
          self.selectedLocation = {
            point: null,
            title: '',
            name: '',
            address: '',
            province: '',
            city: '',
            district: '',
            street: '',
            streetNumber: ''
          };
          self.sheetAddressTitle = '';
          self.sheetAddressText = '';
          self.sheetProviceCityDistrict = '';
          self.sheetDoorNumber = '';

          self.regionForm.province = self.formatProvinceName(province || '');
          self.regionForm.city = city || '';
          self.regionForm.district = district || '';
          self.regionForm.detailAddress = '';
          self.regionDisplayText = self.getRegionParts(
            self.regionForm.province,
            self.regionForm.city,
            self.regionForm.district
          ).join(' ');

          if (riskLocation) {
            self.validateAddressRisk(cleaned, parsed, riskLocation);
          } else {
            self.addressRiskList = [];
            self.addressRiskText = '';
          }
          self.showPasteConfirm = false;
          self.pendingPasteSelection = null;
          self.activeTab = 'region';
          self.isParsingPaste = false;
        };

        const fallbackProvince = this.currentLocation && this.currentLocation.province ? this.currentLocation.province : '';
        const fallbackCity = this.currentLocation && this.currentLocation.city ? this.currentLocation.city : '';
        const fallbackDistrict = this.currentLocation && this.currentLocation.district ? this.currentLocation.district : '';

        this.searchAddressByText(cleaned, function (result) {
          const province = (result && result.province) || parsed.province || fallbackProvince || '';
          const city = (result && result.city) || parsed.city || fallbackCity || '';
          let district = parsed.district || '';

          if (!district) {
            if (parsed.province && parsed.city) {
              district = fallbackDistrict || (result && result.district) || '';
            } else {
              district = (result && result.district) || fallbackDistrict || '';
            }
          } else if (result && result.district) {
            district = result.district;
          }

          const finalRegionLocation = {
            province: province,
            city: city,
            district: district
          };

          applyRegion(province, city, district, finalRegionLocation);
        });
      },

      // 根据解析结果和地图搜索结果生成展示标题。
      buildSearchDisplayTitle: function (parsed, result) {
        const parsedName = parsed && parsed.name ? parsed.name : '';
        const resultTitle = result && result.title ? result.title : '';

        if (parsedName && parsedName.length >= resultTitle.length) {
          return parsedName;
        }

        return resultTitle || parsedName || '已识别地址';
      },

      // 构造粘贴识别后的候选地址对象。
      buildPasteSelectionCandidate: function (cleaned, parsed, finalLocation) {
        const province = finalLocation && finalLocation.province ? finalLocation.province : parsed.province || '';
        const city = finalLocation && finalLocation.city ? finalLocation.city : parsed.city || '';
        const district = finalLocation && finalLocation.district ? finalLocation.district : parsed.district || '';
        const regionText = this.getRegionParts(province, city, district).join(' ');
        const detailAddress = this.getPasteConfirmDetailAddress(cleaned, parsed, finalLocation);

        return {
          activeTab: this.activeTab,
          rawText: cleaned,
          parsed: parsed,
          finalLocation: finalLocation,
          regionText: regionText,
          detailAddress: detailAddress,
          doorNumber: this.extractDoorNumber(parsed)
        };
      },

      // 提取粘贴确认弹窗里展示的详细地址。
      getPasteConfirmDetailAddress: function (cleaned, parsed, finalLocation) {
        const title = finalLocation && (finalLocation.title || finalLocation.name) ? (finalLocation.title || finalLocation.name) : '';
        const fallback = this.extractDetailAddress(cleaned, parsed, finalLocation);

        if (title && title.length > 2) {
          return title;
        }

        return fallback;
      },

      // 从原始文本和地图结果中提取去掉省市区后的详细地址。
      extractDetailAddress: function (cleaned, parsed, finalLocation) {
        let detailAddress = parsed && parsed.detail ? parsed.detail : '';
        const address = finalLocation && finalLocation.address ? finalLocation.address : cleaned;
        const province = finalLocation && finalLocation.province ? finalLocation.province : '';
        const city = finalLocation && finalLocation.city ? finalLocation.city : '';
        const district = finalLocation && finalLocation.district ? finalLocation.district : '';

        if (!detailAddress) {
          detailAddress = address || '';
        }

        [province, city, district].forEach(function (item) {
          if (item) {
            detailAddress = detailAddress.replace(item, '');
          }
        });

        detailAddress = detailAddress.replace(/^\s+|\s+$/g, '');

        if (!detailAddress) {
          detailAddress = address || cleaned || '';
        }

        return detailAddress;
      },

      // 从解析结果中提取门牌号、房号等尾部信息。
      extractDoorNumber: function (parsed) {
        if (!parsed) return '';
        if (parsed.streetNumber) {
          return parsed.streetNumber;
        }

        const detail = parsed.detail || '';
        const tailNumberMatch = detail.match(/(\d{2,}[A-Za-z]?|\d+[甲乙丙丁])$/);
        if (tailNumberMatch) {
          return tailNumberMatch[0];
        }

        return '';
      },

      // 打开粘贴识别确认弹窗，让用户确认识别结果。
      openPasteConfirm: function (candidate) {
        this.pendingPasteSelection = candidate;
        this.pasteConfirmData = {
          regionText: candidate && candidate.regionText ? candidate.regionText : '',
          detailAddress: candidate && candidate.detailAddress ? candidate.detailAddress : ''
        };
        this.showPasteConfirm = true;
      },

      // 取消粘贴识别确认，并清空临时候选数据。
      cancelPasteConfirm: function () {
        this.showPasteConfirm = false;
        this.pendingPasteSelection = null;
        this.pasteConfirmData = {
          regionText: '',
          detailAddress: ''
        };
      },

      // 确认使用粘贴识别结果，并回填到当前选址模式。
      confirmPasteSelection: function () {
        const candidate = this.pendingPasteSelection;

        if (!candidate) {
          this.showPasteConfirm = false;
          return;
        }

        if (candidate.activeTab === 'map') {
          this.applyMapLocationToSheet(candidate.finalLocation || {});
          this.sheetDoorNumber = candidate.doorNumber || '';
          this.activeTab = 'map';
        } else {
          this.regionForm.province = candidate.finalLocation && candidate.finalLocation.province ? candidate.finalLocation.province : '';
          this.regionForm.city = candidate.finalLocation && candidate.finalLocation.city ? candidate.finalLocation.city : '';
          this.regionForm.district = candidate.finalLocation && candidate.finalLocation.district ? candidate.finalLocation.district : '';
          this.regionForm.detailAddress = candidate.detailAddress || '';
          this.regionDisplayText = candidate.regionText || this.getRegionParts(
            this.regionForm.province,
            this.regionForm.city,
            this.regionForm.district
          ).join(' ');
          this.activeTab = 'region';
        }

        this.showPasteConfirm = false;
        this.pendingPasteSelection = null;
        this.pasteConfirmData = {
          regionText: '',
          detailAddress: ''
        };
      },

      // 清洗粘贴文本，移除手机号、联系人等无关信息。
      cleanAddressText: function (text) {
        let t = text || '';
        t = t.replace(/收货地址[:：]?\s*/g, '');
        t = t.replace(/详细地址[:：]?\s*/g, '');
        t = t.replace(/所在地区[:：]?\s*/g, '');
        t = t.replace(/地址[:：]?\s*/g, '');
        t = t.replace(/收货人[:：]?\s*[^\s，,；;]+/g, '');
        t = t.replace(/联系人[:：]?\s*[^\s，,；;]+/g, '');
        t = t.replace(/手机号(?:码)?[:：]?\s*1\d{10}/g, '');
        t = t.replace(/电话[:：]?\s*1\d{10}/g, '');
        t = t.replace(/\b1\d{10}\b/g, '');
        t = t.replace(/[\r\n\t]/g, ' ');
        t = t.replace(/\s+/g, ' ');
        t = t.replace(/[，,；;]/g, '');
        t = t.trim();
        return t;
      },

      // 用正则做基础地址解析，提取省市区、街道和门牌号。
      simpleParseAddress: function (text) {
        const result = {
          province: '',
          city: '',
          district: '',
          street: '',
          streetNumber: '',
          detail: '',
          name: ''
        };

        const source = text || '';
        let remain = source;

        const provinceMatch = source.match(/(北京市|天津市|上海市|重庆市|香港特别行政区|澳门特别行政区|内蒙古自治区|广西壮族自治区|西藏自治区|宁夏回族自治区|新疆维吾尔自治区|[^省]+省)/);
        if (provinceMatch) {
          result.province = this.formatProvinceName(provinceMatch[0]);
          remain = remain.replace(provinceMatch[0], '');
        }

        const cityMatch = remain.match(/([^市]+市|[^州]+州|[^地区]+地区|[^盟]+盟)/);
        if (cityMatch) result.city = cityMatch[0];

        if (result.city) {
          remain = remain.replace(result.city, '');
        }

        const districtMatch = remain.match(/([^区]+区|[^县]+县|[^旗]+旗|[^市]+市)/);
        if (districtMatch) result.district = districtMatch[0];

        if (result.district) remain = remain.replace(result.district, '');

        const houseMatch = remain.match(/([A-Za-z0-9一二三四五六七八九十百千号栋幢单元室层楼\-]+)$/);
        result.detail = houseMatch ? houseMatch[0] : remain.trim();

        const streetMatch = source.match(/([^省市区县]+(?:路|街|道|巷))/);
        if (streetMatch) result.street = streetMatch[0];

        const streetNumberMatch = source.match(/(\d+号|\d+弄|\d+栋|\d+幢|\d+单元|\d+室|[A-Za-z0-9\-]+室|\b\d{2,}\b)$/);
        if (streetNumberMatch) result.streetNumber = streetNumberMatch[0];

        result.name = remain.trim().slice(0, 20);

        return result;
      },

      // 用整段地址文本调用地图搜索，辅助修正识别结果。
      searchAddressByText: function (keyword, callback) {
        const self = this;

        if (!keyword) {
          callback(null);
          return;
        }

        const mapContext = this.pickerMapInstance || new BMapGL.Map(document.createElement('div'));

        const localSearch = new BMapGL.LocalSearch(mapContext, {
          pageCapacity: 1,
          onSearchComplete: function (results) {
            if (!results || localSearch.getStatus() !== 0 || results.getCurrentNumPois() === 0) {
              callback(null);
              return;
            }

            const poi = results.getPoi(0);
            if (!poi || !poi.point) {
              callback(null);
              return;
            }

            if (!self.geocoder) {
              callback({
                point: poi.point,
                title: poi.title || '',
                address: poi.address || '',
                province: poi.province || '',
                city: poi.city || '',
                district: poi.district || ''
              });
              return;
            }

            self.geocoder.getLocation(poi.point, function (rs) {
              const ac = rs && rs.addressComponents ? rs.addressComponents : {};
              callback({
                point: poi.point,
                title: poi.title || '',
                address: (rs && rs.address) || poi.address || keyword,
                province: self.formatProvinceName(ac.province || poi.province || ''),
                city: ac.city || poi.city || '',
                district: ac.district || poi.district || '',
                street: ac.street || '',
                streetNumber: ac.streetNumber || ''
              });
            });
          }
        });

        localSearch.search(keyword);
      },

      // 校验输入地址和地图识别结果是否存在省市区不一致等风险。
      validateAddressRisk: function (rawText, parsedInput, finalLocation) {
        let risks = [];

        const inputProvince = parsedInput && parsedInput.province ? parsedInput.province : '';
        const inputCity = parsedInput && parsedInput.city ? parsedInput.city : '';
        const inputDistrict = parsedInput && parsedInput.district ? parsedInput.district : '';

        const finalProvince = finalLocation && finalLocation.province ? this.formatProvinceName(finalLocation.province) : '';
        const finalCity = finalLocation && finalLocation.city ? finalLocation.city : '';
        const finalDistrict = finalLocation && finalLocation.district ? finalLocation.district : '';

        if (!inputProvince || !inputCity || !inputDistrict) {
          risks.push('输入地址中的省、市、区信息可能不完整');
        }

        if (inputProvince && finalProvince && this.formatProvinceName(inputProvince) !== finalProvince) {
          risks.push('输入的省份与识别结果不一致：输入为“' + inputProvince + '”，识别为“' + finalProvince + '”');
        }

        if (inputCity && finalCity && inputCity !== finalCity) {
          risks.push('输入的城市与识别结果不一致：输入为“' + inputCity + '”，识别为“' + finalCity + '”');
        }

        if (inputDistrict && finalDistrict && inputDistrict !== finalDistrict) {
          risks.push('输入的区县与识别结果不一致：输入为“' + inputDistrict + '”，识别为“' + finalDistrict + '”');
        }

        if (parsedInput && parsedInput.detail && parsedInput.detail.length < 2) {
          risks.push('详细地址过短，可能不完整');
        }

        this.addressRiskList = risks;
        this.addressRiskText = risks.join('；');
      },

      // 生成地图选址模式最终提交给父组件的数据。
      buildMapPayload: function () {
        this.form.province = this.selectedLocation.province || '';
        this.form.city = this.selectedLocation.city || '';
        this.form.district = this.selectedLocation.district || '';
        this.form.street = this.selectedLocation.street || '';
        this.form.streetNumber = this.selectedLocation.streetNumber || '';
        this.form.fullAddress = this.selectedLocation.address || this.sheetAddressText || '';
        this.form.lng = this.selectedLocation.point ? (this.selectedLocation.point.lng || '') : '';
        this.form.lat = this.selectedLocation.point ? (this.selectedLocation.point.lat || '') : '';

        if (this.sheetDoorNumber) {
          this.form.detailAddress = this.sheetDoorNumber;
        }

        return {
          province: this.form.province,
          city: this.form.city,
          district: this.form.district,
          street: this.form.street,
          streetNumber: this.form.streetNumber,
          detailAddress: this.form.detailAddress || '',
          fullAddress: this.form.fullAddress,
          lng: this.form.lng,
          lat: this.form.lat,
          title: this.selectedLocation.title || this.sheetAddressTitle || '',
          hasRisk: this.addressRiskList.length > 0,
          riskConfirmed: this.riskConfirmed,
          riskMessages: this.addressRiskList.slice()
        };
      },

      // 生成地区选址模式最终提交给父组件的数据。
      buildRegionPayload: function () {
        this.form.province = this.regionForm.province || '';
        this.form.city = this.regionForm.city || '';
        this.form.district = this.regionForm.district || '';
        this.form.street = '';
        this.form.streetNumber = '';
        this.form.lng = '';
        this.form.lat = '';
        this.form.detailAddress = this.regionForm.detailAddress || '';
        this.form.fullAddress = this.composeRegionFullAddress();

        return {
          province: this.form.province,
          city: this.form.city,
          district: this.form.district,
          street: '',
          streetNumber: '',
          detailAddress: this.form.detailAddress || '',
          fullAddress: this.form.fullAddress,
          lng: '',
          lat: '',
          title: this.regionDisplayText || '',
          hasRisk: this.addressRiskList.length > 0,
          riskConfirmed: this.riskConfirmed,
          riskMessages: this.addressRiskList.slice()
        };
      },

      // 保存最终地址结果，并通过事件和 postMessage 通知外部页面。
      savePayload: function (payload) {
        
        this.$emit('confirm', payload);
        this.$emit('selected', payload);
        this.$emit('input', payload);
        localStorage.setItem('customer_address_payload', JSON.stringify(payload));

        if (window.parent) {
          window.parent.postMessage({
            type: 'ADDRESS_SELECTED',
            data: payload
          }, '*');
        }

        console.log('地址确认回填数据:', payload);
        this.showAddressSheet = false;
      },

      // 点击确认按钮时校验表单，并决定是否直接提交或弹出风险确认。
      confirmSheetAddress: function () {
        let payload;

        if (this.activeTab === 'map') {
          if (!this.selectedLocation.address && !this.sheetAddressText) {
            this.showAlert('请先选择或识别地址');
            return;
          }
          payload = this.buildMapPayload();
        } else {
          if (!this.regionDisplayText) {
            this.showAlert('请先选择所在地区');
            return;
          }
          if (!this.regionForm.detailAddress) {
            this.showAlert('请填写详细地址');
            return;
          }
          payload = this.buildRegionPayload();
        }

        if (this.addressRiskList.length) {
          this.pendingPayload = payload;
          this.showRiskConfirm = true;
          return;
        }

        this.riskConfirmed = false;
        this.savePayload(payload);
      },

      // 取消风险确认弹窗，保留当前地址选择状态。
      cancelRiskConfirm: function () {
        this.showRiskConfirm = false;
        this.pendingPayload = null;
      },

      // 用户确认风险后继续提交地址数据。
      continueRiskConfirm: function () {
        this.riskConfirmed = true;
        this.showRiskConfirm = false;

        const payload = this.pendingPayload || (this.activeTab === 'map' ? this.buildMapPayload() : this.buildRegionPayload());
        payload.riskConfirmed = true;
        payload.hasRisk = this.addressRiskList.length > 0;
        payload.riskMessages = this.addressRiskList.slice();

        this.savePayload(payload);
        this.pendingPayload = null;
      }
    }
  };

  global.BaiduMapAddressPicker = component;

  if (global.Vue && global.Vue.component) {
    global.Vue.component(componentName, component);
  }
})(window);
