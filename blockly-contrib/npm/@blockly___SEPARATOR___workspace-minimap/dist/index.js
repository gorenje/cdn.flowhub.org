/*! For license information please see index.js.LICENSE.txt */
!function(t,i){if("object"==typeof exports&&"object"==typeof module)module.exports=i(require("blockly/core"));else if("function"==typeof define&&define.amd)define(["blockly/core"],i);else{var e="object"==typeof exports?i(require("blockly/core")):i(t.Blockly);for(var o in e)("object"==typeof exports?exports:t)[o]=e[o]}}(this,(t=>(()=>{"use strict";var i={612:(t,i,e)=>{Object.defineProperty(i,"__esModule",{value:!0}),i.FocusRegion=void 0;var o=e(573),r=new Set([o.Events.VIEWPORT_CHANGE,o.Events.BLOCK_CHANGE,o.Events.BLOCK_CREATE,o.Events.BLOCK_DELETE,o.Events.BLOCK_DRAG,o.Events.BLOCK_MOVE]),n=function(){function t(t,i){this.primaryWorkspace=t,this.minimapWorkspace=i,this.initialized=!1,this.id=String(Math.random()).substring(2)}return t.prototype.init=function(){var t=this;this.svgGroup=o.utils.dom.createSvgElement(o.utils.Svg.G,{class:"blockly-focus-region"},null);var i=o.utils.dom.createSvgElement(new o.utils.Svg("mask"),{id:"focusRegionMask"+this.id},this.svgGroup);this.background=o.utils.dom.createSvgElement(o.utils.Svg.RECT,{x:0,y:0,width:"100%",height:"100%",mask:"url(#focusRegionMask"+this.id+")"},this.svgGroup),o.utils.dom.createSvgElement(o.utils.Svg.RECT,{x:0,y:0,width:"100%",height:"100%",fill:"white"},i),this.rect=o.utils.dom.createSvgElement(o.utils.Svg.RECT,{x:0,y:0,rx:6,ry:6,fill:"black"},i);var e=this.minimapWorkspace.getParentSvg();e.firstChild?e.insertBefore(this.svgGroup,e.firstChild):e.appendChild(this.svgGroup),window.addEventListener("resize",(function(){t.update()})),window.addEventListener("load",(function(){t.update()})),this.onChangeWrapper=this.onChange.bind(this),this.primaryWorkspace.addChangeListener(this.onChangeWrapper),this.update(),this.initialized=!0},t.prototype.dispose=function(){this.onChangeWrapper&&(this.primaryWorkspace.removeChangeListener(this.onChangeWrapper),this.onChangeWrapper=null),this.svgGroup&&o.utils.dom.removeNode(this.svgGroup),this.svgGroup=null,this.rect=null,this.background=null,this.initialized=!1},t.prototype.onChange=function(t){r.has(t.type)&&this.update()},t.prototype.update=function(){var t=this.primaryWorkspace.getMetricsManager(),i=this.minimapWorkspace.getMetricsManager(),e=t.getViewMetrics(!0),o=t.getContentMetrics(!0),r=i.getContentMetrics(),n=i.getSvgMetrics();if(0!==o.width){var s=r.width/i.getContentMetrics(!0).width,a=e.width*s,p=e.height*s,h=(e.left-o.left)*s,c=(e.top-o.top)*s;h+=(n.width-r.width)/2,c+=(n.height-r.height)/2,this.rect.setAttribute("transform","translate(".concat(h,",").concat(c,")")),this.rect.setAttribute("width",a.toString()),this.rect.setAttribute("height",p.toString())}},t.prototype.isEnabled=function(){return this.initialized},t}();i.FocusRegion=n,o.Css.register("\n.blockly-focus-region {\n  fill: #e6e6e6;\n}\n")},339:(t,i,e)=>{Object.defineProperty(i,"__esModule",{value:!0}),i.Minimap=void 0;var o=e(573),r=e(612),n=new Set([o.Events.BLOCK_CHANGE,o.Events.BLOCK_CREATE,o.Events.BLOCK_DELETE,o.Events.BLOCK_DRAG,o.Events.BLOCK_MOVE]),s=function(){function t(t){this.primaryWorkspace=t}return t.prototype.init=function(){var t=this;this.minimapWrapper=document.createElement("div"),this.minimapWrapper.id="minimapWrapper"+this.primaryWorkspace.id,this.minimapWrapper.className="blockly-minimap";var i=this.primaryWorkspace.getInjectionDiv().parentNode;i.appendChild(this.minimapWrapper),this.minimapWorkspace=o.inject(this.minimapWrapper.id,{rtl:this.primaryWorkspace.RTL,move:{scrollbars:!0,drag:!1,wheel:!1},zoom:{maxScale:null,minScale:null},readOnly:!0,theme:this.primaryWorkspace.getTheme(),renderer:this.primaryWorkspace.options.renderer}),this.minimapWorkspace.scrollbar.setContainerVisible(!1),this.primaryWorkspace.addChangeListener((function(i){t.mirror(i)})),window.addEventListener("resize",(function(){t.minimapWorkspace.zoomToFit()})),this.onMouseDownWrapper=o.browserEvents.bind(this.minimapWorkspace.svgGroup_,"mousedown",this,this.onClickDown),this.onMouseUpWrapper=o.browserEvents.bind(i,"mouseup",this,this.onClickUp),this.focusRegion=new r.FocusRegion(this.primaryWorkspace,this.minimapWorkspace),this.enableFocusRegion()},t.prototype.dispose=function(){this.isFocusEnabled()&&this.disableFocusRegion(),this.minimapWorkspace.dispose(),o.utils.dom.removeNode(this.minimapWrapper),this.onMouseMoveWrapper&&o.browserEvents.unbind(this.onMouseMoveWrapper),this.onMouseDownWrapper&&o.browserEvents.unbind(this.onMouseDownWrapper),this.onMouseUpWrapper&&o.browserEvents.unbind(this.onMouseUpWrapper)},t.prototype.mirror=function(t){var i=this;if(n.has(t.type)&&(t.type!==o.Events.BLOCK_CREATE||"shadow"!==t.xml.tagName)){var e=t.toJson();o.Events.fromJson(e,this.minimapWorkspace).run(!0),o.renderManagement.finishQueuedRenders().then((function(){i.minimapWorkspace.zoomToFit()}))}},t.minimapToPrimaryCoords=function(t,i,e,o){e-=(i.svgWidth-i.contentWidth)/2,o-=(i.svgHeight-i.contentHeight)/2;var r=t.contentWidth/i.contentWidth;e*=r,o*=r;var n=-t.contentLeft-e,s=-t.contentTop-o;return[n+=t.viewWidth/2,s+=t.viewHeight/2]},t.prototype.primaryScroll=function(i){var e=t.minimapToPrimaryCoords(this.primaryWorkspace.getMetrics(),this.minimapWorkspace.getMetrics(),i.offsetX,i.offsetY),o=e[0],r=e[1];this.primaryWorkspace.scroll(o,r)},t.prototype.onClickDown=function(t){this.onMouseMoveWrapper=o.browserEvents.bind(this.minimapWorkspace.svgGroup_,"mousemove",this,this.onMouseMove),this.primaryScroll(t)},t.prototype.onClickUp=function(){this.onMouseMoveWrapper&&(o.browserEvents.unbind(this.onMouseMoveWrapper),this.onMouseMoveWrapper=null)},t.prototype.onMouseMove=function(t){this.primaryScroll(t)},t.prototype.enableFocusRegion=function(){this.focusRegion.init()},t.prototype.disableFocusRegion=function(){this.focusRegion.dispose()},t.prototype.isFocusEnabled=function(){return this.focusRegion.isEnabled()},t}();i.Minimap=s},245:function(t,i,e){var o,r=this&&this.__extends||(o=function(t,i){return o=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,i){t.__proto__=i}||function(t,i){for(var e in i)Object.prototype.hasOwnProperty.call(i,e)&&(t[e]=i[e])},o(t,i)},function(t,i){if("function"!=typeof i&&null!==i)throw new TypeError("Class extends value "+String(i)+" is not a constructor or null");function e(){this.constructor=t}o(t,i),t.prototype=null===i?Object.create(i):(e.prototype=i.prototype,new e)});Object.defineProperty(i,"__esModule",{value:!0}),i.PositionedMinimap=void 0;var n=e(573),s=function(t){function i(i){var e=t.call(this,i)||this;return e.id="minimap",e.margin=20,e.top=0,e.left=0,e.width=225,e.height=150,e}return r(i,t),i.prototype.init=function(){t.prototype.init.call(this),this.primaryWorkspace.getComponentManager().addComponent({component:this,weight:3,capabilities:[n.ComponentManager.Capability.POSITIONABLE]}),this.primaryWorkspace.resize()},i.prototype.getBoundingRectangle=function(){return new n.utils.Rect(this.top,this.top+this.height,this.left,this.left+this.width)},i.prototype.position=function(t,i){this.setSize(),this.setPosition(t,i),this.setAttributes()},i.prototype.setSize=function(){var t=this.primaryWorkspace.getMetrics().viewWidth;this.width=Math.max(200,t/5),this.height=2*this.width/3},i.prototype.setPosition=function(t,i){var e=this.primaryWorkspace,o=e.scrollbar,r=o&&o.isVisible()&&o.canScrollVertically(),s=o&&o.isVisible()&&o.canScrollHorizontally();t.toolboxMetrics.position===n.TOOLBOX_AT_LEFT||e.horizontalLayout&&!e.RTL?(this.left=t.absoluteMetrics.left+t.viewMetrics.width-this.width-this.margin,r&&!e.RTL&&(this.left-=n.Scrollbar.scrollbarThickness)):(this.left=this.margin,r&&e.RTL&&(this.left+=n.Scrollbar.scrollbarThickness));var a=t.toolboxMetrics.position===n.TOOLBOX_AT_BOTTOM;a?(this.top=t.absoluteMetrics.top+t.viewMetrics.height-this.height-this.margin,s&&(this.top-=n.Scrollbar.scrollbarThickness)):this.top=t.absoluteMetrics.top+this.margin;for(var p=this.getBoundingRectangle(),h=0;h<i.length;h++)p.intersects(i[h])&&(this.top=a?i[h].top-this.height-this.margin:i[h].bottom+this.margin,p=this.getBoundingRectangle(),h=-1)},i.prototype.setAttributes=function(){var t=this.minimapWorkspace.getInjectionDiv().parentElement.style;t.zIndex="2",t.position="absolute",t.width="".concat(this.width,"px"),t.height="".concat(this.height,"px"),t.top="".concat(this.top,"px"),t.left="".concat(this.left,"px"),n.svgResize(this.minimapWorkspace)},i}(e(339).Minimap);i.PositionedMinimap=s,n.Css.register("\n.blockly-minimap {\n  box-shadow: 2px 2px 10px grey;\n}\n")},573:i=>{i.exports=t}},e={};function o(t){var r=e[t];if(void 0!==r)return r.exports;var n=e[t]={exports:{}};return i[t].call(n.exports,n,n.exports,o),n.exports}var r={};return(()=>{var t=r;Object.defineProperty(t,"__esModule",{value:!0}),t.PositionedMinimap=t.Minimap=void 0;var i=o(339);Object.defineProperty(t,"Minimap",{enumerable:!0,get:function(){return i.Minimap}});var e=o(245);Object.defineProperty(t,"PositionedMinimap",{enumerable:!0,get:function(){return e.PositionedMinimap}})})(),r})()));
//# sourceMappingURL=index.js.map