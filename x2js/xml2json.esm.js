/**
 * DOM 节点类型
 * @type {{ELEMENT_NODE: number, TEXT_NODE: number, CDATA_SECTION_NODE: number, DOCUMENT_NODE: number, COMMENT_NODE: number}}
 */
const DOMNodeTypes = {
    ELEMENT_NODE: 1,
    TEXT_NODE: 3,
    CDATA_SECTION_NODE: 4,
    COMMENT_NODE: 8,
    DOCUMENT_NODE: 9
}

class X2JS {
    constructor(config) {
        this.VERSION = "1.2.0";
        this.config = config || {};
        this.initConfigDefaults();
    }

    /**
     * 初始化默认配置
     */
    initConfigDefaults() {
        this.config.escapeMode = this.config.escapeMode ?? true;
        this.config.attributePrefix = this.config.attributePrefix ?? "_";
        this.config.arrayAccessForm = this.config.arrayAccessForm ?? "none";
        this.config.emptyNodeForm = this.config.emptyNodeForm ?? "text";
        this.config.enableToStringFunc = this.config.enableToStringFunc ?? true;
        this.config.arrayAccessFormPaths = this.config.arrayAccessFormPaths ?? [];
        this.config.skipEmptyTextNodesForObj = this.config.skipEmptyTextNodesForObj ?? true;
        this.config.stripWhitespaces = this.config.stripWhitespaces ?? true;
        this.config.datetimeAccessFormPaths = this.config.datetimeAccessFormPaths ?? [];
        this.config.useDoubleQuotes = this.config.useDoubleQuotes ?? false;
        this.config.xmlElementsFilter = this.config.xmlElementsFilter ?? [];
        this.config.jsonPropertiesFilter = this.config.jsonPropertiesFilter ?? [];
        this.config.keepCData = this.config.keepCData ?? false;
        this.config.emptyArrayKeepTag = this.config.emptyArrayKeepTag ?? true;
    }

    getNodeLocalName(node) {
        return node.localName || node.baseName || node.nodeName;
    }

    getNodePrefix(node) {
        return node.prefix;
    }

    escapeXmlChars(str) {
        if (typeof (str) == "string")
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
        else
            return str;
    }

    unescapeXmlChars(str) {
        return str
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&amp;/g, '&');
    }

    checkInStdFiltersArrayForm(stdFiltersArrayForm, obj, name, path) {
        let idx = 0;
        for(; idx < stdFiltersArrayForm.length; idx++) {
            let filterPath = stdFiltersArrayForm[idx];
            if (
                (typeof filterPath === "string" && filterPath === path)
                || (filterPath instanceof RegExp && filterPath.test(path))
                || (typeof filterPath === "function" && filterPath(obj, name, path))
            ) {
                break;
            }
        }
        return idx !== stdFiltersArrayForm.length;
    }

    // xml to json
    toArrayAccessForm(obj, childName, path) {
        if (this.config.arrayAccessForm === 'property') {
            obj[childName + "_asArray"] = (obj[childName] instanceof Array) ? obj[childName] : [obj[childName]];
        }

        if (
            !(obj[childName] instanceof Array)
            && this.config.arrayAccessFormPaths.length > 0
            && this.checkInStdFiltersArrayForm(this.config.arrayAccessFormPaths, obj, childName, path)
        ) {
            obj[childName] = [obj[childName]];
        }
    }

    /**
     * 转换日期类型
     * @param prop
     * @returns {Date}
     */
    fromXmlDateTime(prop) {
        // Implementation based up on http://stackoverflow.com/questions/8178598/xml-datetime-to-javascript-date-object
        // Improved to support full spec and optional parts
        const bits = prop.split(/[-T:+Z]/g);
        let d = new Date(bits[0], bits[1] - 1, bits[2]);
        const secondBits = bits[5].split("\.");
        d.setHours(bits[3], bits[4], secondBits[0]);
        if (secondBits.length > 1)
            d.setMilliseconds(secondBits[1]);

        // Get supplied time zone offset in minutes
        if (bits[6] && bits[7]) {
            let offsetMinutes = bits[6] * 60 + Number(bits[7]);
            const sign = /\d\d-\d\d:\d\d$/.test(prop) ? '-' : '+';

            // Apply the sign
            offsetMinutes = +(sign === '-' ? -1 * offsetMinutes : offsetMinutes);

            // Apply offset and local timezone
            d.setMinutes(d.getMinutes() - offsetMinutes - d.getTimezoneOffset())
        } else if (prop.indexOf("Z", prop.length - 1) !== -1) {
            d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()));
        }

        // d is now a local time equivalent to the supplied time
        return d;
    }

    // xml to json
    checkFromXmlDateTimePaths(value, childName, fullPath) {
        if (this.config.datetimeAccessFormPaths.length > 0) {
            const path = fullPath.split("\.#")[0];
            if (this.checkInStdFiltersArrayForm(this.config.datetimeAccessFormPaths, value, childName, path)) {
                return this.fromXmlDateTime(value);
            } else
                return value;
        } else
            return value;
    }

    // xml to json
    checkXmlElementsFilter(obj, childType, childName, childPath) {
        if (
            childType === DOMNodeTypes.ELEMENT_NODE
            && this.config.xmlElementsFilter.length > 0
        ) {
            return this.checkInStdFiltersArrayForm(this.config.xmlElementsFilter, obj, childName, childPath);
        } else
            return true;
    }

    // xml to json
    parseDOMChildren(node, path) {
        if (node.nodeType === DOMNodeTypes.DOCUMENT_NODE) {
            const result = {};
            const nodeChildren = node.childNodes;
            // Alternative for firstElementChild which is not supported in some environments
            for(let cidx = 0; cidx < nodeChildren.length; cidx++) {
                const child = nodeChildren.item(cidx);
                if (child.nodeType === DOMNodeTypes.ELEMENT_NODE) {
                    const childName = this.getNodeLocalName(child);
                    result[childName] = this.parseDOMChildren(child, childName);
                }
            }
            return result;
        } else if (node.nodeType === DOMNodeTypes.ELEMENT_NODE) {
            let result = {
                __cnt: 0
            };
            const nodeChildren = node.childNodes;
            let childName;
            // Children nodes
            for(let cidx = 0; cidx < nodeChildren.length; cidx++) {
                const child = nodeChildren.item(cidx); // nodeChildren[cidx];
                childName = this.getNodeLocalName(child);
                if (child.nodeType !== DOMNodeTypes.COMMENT_NODE) {
                    const childPath = path + "." + childName;
                    if (this.checkXmlElementsFilter(result, child.nodeType, childName, childPath)) {
                        result.__cnt++;
                        if (result[childName] == null) {
                            result[childName] = this.parseDOMChildren(child, childPath);
                            this.toArrayAccessForm(result, childName, childPath);
                        } else {
                            if (
                                result[childName] != null
                                && !(result[childName] instanceof Array)
                            ) {
                                result[childName] = [result[childName]];
                                this.toArrayAccessForm(result, childName, childPath);
                            }
                            (result[childName])[result[childName].length] = this.parseDOMChildren(child, childPath);
                        }
                    }
                }
            }

            // Attributes
            for(let aidx = 0; aidx < node.attributes.length; aidx++) {
                const attr = node.attributes.item(aidx); // [aidx];
                result.__cnt++;
                result[this.config.attributePrefix + attr.name] = attr.value;
            }

            // Node namespace prefix
            const nodePrefix = this.getNodePrefix(node);
            if (nodePrefix != null && nodePrefix !== "") {
                result.__cnt++;
                result.__prefix = nodePrefix;
            }

            if (result["#text"] != null) {
                result.__text = result["#text"];
                if (result.__text instanceof Array) {
                    result.__text = result.__text.join("\n");
                }
                //if(config.escapeMode)
                //	result.__text = unescapeXmlChars(result.__text);
                if (this.config.stripWhitespaces)
                    result.__text = result.__text.trim();
                delete result["#text"];
                if (this.config.arrayAccessForm === "property")
                    delete result["#text_asArray"];
                result.__text = this.checkFromXmlDateTimePaths(result.__text, childName, path + "." + childName);
            }
            if (result["#cdata-section"] != null) {
                result.__cdata = result["#cdata-section"];
                delete result["#cdata-section"];
                if (this.config.arrayAccessForm === "property")
                    delete result["#cdata-section_asArray"];
            }

            if (result.__cnt === 0) {
                if (this.config.emptyNodeForm === "text") {
                    result = '';
                } else if (this.config.emptyNodeForm === "null") {
                    return null;
                } else if (this.config.emptyNodeForm === "undefined") {
                    return undefined;
                }
            } else if (result.__cnt === 1 && result.__text != null) {
                result = result.__text;
            } else if (result.__cnt === 1 && result.__cdata != null && !this.config.keepCData) {
                result = result.__cdata;
            } else if (result.__cnt > 1 && result.__text != null && this.config.skipEmptyTextNodesForObj) {
                if ((this.config.stripWhitespaces && result.__text === "") || (result.__text.trim() === "")) {
                    delete result.__text;
                }
            }
            delete result.__cnt;

            if (this.config.enableToStringFunc && (result.__text != null || result.__cdata != null)) {
                result.toString = function() {
                    return (this.__text != null ? this.__text : '') + (this.__cdata != null ? this.__cdata : '');
                };
            }

            return result;
        } else if (
            node.nodeType === DOMNodeTypes.TEXT_NODE
            || node.nodeType === DOMNodeTypes.CDATA_SECTION_NODE
        ) {
            return node.nodeValue;
        }
    }

    // json to xml
    startTag(jsonObj, element, attrList, closed) {
        const prefix = ((jsonObj != null && jsonObj.__prefix != null) ? (`${jsonObj.__prefix}:`) : "")
        const result = ["<", prefix, element]
        if (attrList != null) {
            for(let aidx = 0; aidx < attrList.length; aidx++) {
                const attrName = attrList[aidx];
                let attrVal = jsonObj[attrName];
                if (this.config.escapeMode)
                    attrVal = this.escapeXmlChars(attrVal);
                result.push(" ", attrName.substr(this.config.attributePrefix.length), "=")
                if (this.config.useDoubleQuotes)
                    result.push('"', attrVal, '"');
                else
                    result.push("'", attrVal, "'");
            }
        }
        result.push(closed ? '/>' : '>');
        return result.join('');
    }

    // json to xml
    endTag(jsonObj, elementName) {
        const prefix = (jsonObj.__prefix != null ? (`${jsonObj.__prefix}:`) : "")
        return `</${prefix}${elementName}>`;
    }

    // json to xml
    endsWith(str, suffix) {
        return str.indexOf(suffix, str.length - suffix.length) !== -1;
    }

    // json to xml
    jsonXmlSpecialElem(jsonObj, jsonObjField) {
        return (
            (
                this.config.arrayAccessForm === "property"
                && this.endsWith(jsonObjField.toString(), ("_asArray"))
            )
            || jsonObjField.toString().indexOf(this.config.attributePrefix) === 0
            || jsonObjField.toString().indexOf("__") === 0
            || (jsonObj[jsonObjField] instanceof Function)
        )
    }

    // json to xml
    jsonXmlElemCount(jsonObj) {
        let elementsCnt = 0;
        if (jsonObj instanceof Object) {
            for(let it in jsonObj) {
                if (this.jsonXmlSpecialElem(jsonObj, it))
                    continue;
                elementsCnt++;
            }
        }
        return elementsCnt;
    }

    // json to xml
    checkJsonObjPropertiesFilter(jsonObj, propertyName, jsonObjPath) {
        return (
            this.config.jsonPropertiesFilter.length === 0
            || jsonObjPath === ""
            || this.checkInStdFiltersArrayForm(this.config.jsonPropertiesFilter, jsonObj, propertyName, jsonObjPath)
        )
    }

    // json to xml
    parseJSONAttributes(jsonObj) {
        const attrList = [];
        if (jsonObj instanceof Object) {
            for(let ait in jsonObj) {
                if (
                    ait.toString().indexOf("__") === -1
                    && ait.toString().indexOf(this.config.attributePrefix) === 0
                ) {
                    attrList.push(ait);
                }
            }
        }
        return attrList;
    }

    // json to xml
    parseJSONTextAttrs(jsonTxtObj) {
        const result = [];
        if (jsonTxtObj.__cdata != null) {
            result.push(`<![CDATA[${jsonTxtObj.__cdata}]]>`);
        }
        if (jsonTxtObj.__text != null) {
            result.push(this.config.escapeMode ? this.escapeXmlChars(jsonTxtObj.__text) : jsonTxtObj.__text);
        }
        return result.join('');
    }

    // json to xml
    parseJSONTextObject(jsonTxtObj) {
        let result = '';
        if (jsonTxtObj instanceof Object) {
            result = this.parseJSONTextAttrs(jsonTxtObj);
        } else if (jsonTxtObj != null) {
            result = this.config.escapeMode ? this.escapeXmlChars(jsonTxtObj) : jsonTxtObj;
        }

        return result;
    }

    // json to xml
    getJsonPropertyPath(jsonObjPath, jsonPropName) {
        return jsonObjPath === "" ? jsonPropName : `${jsonObjPath}.${jsonPropName}`;
    }

    // json to xml
    parseJSONArray(jsonArrRoot, jsonArrObj, attrList, jsonObjPath) {
        const result = [];
        if (jsonArrRoot.length === 0) {
            // 空数组是否保留标签
            if (this.config.emptyArrayKeepTag) {
                result.push(this.startTag(jsonArrRoot, jsonArrObj, attrList, true));
            }
        } else {
            for(let arIdx = 0; arIdx < jsonArrRoot.length; arIdx++) {
                result.push(this.startTag(jsonArrRoot[arIdx], jsonArrObj, this.parseJSONAttributes(jsonArrRoot[arIdx]), false));
                result.push(this.parseJSONObject(jsonArrRoot[arIdx], this.getJsonPropertyPath(jsonObjPath, jsonArrObj)));
                result.push(this.endTag(jsonArrRoot[arIdx], jsonArrObj));
            }
        }
        return result.join('');
    }

    // json to xml
    parseJSONObject(jsonObj, jsonObjPath) {
        const result = [];
        const elementsCnt = this.jsonXmlElemCount(jsonObj);
        if (elementsCnt > 0) {
            for(let it in jsonObj) {
                if (
                    this.jsonXmlSpecialElem(jsonObj, it)
                    || (
                        jsonObjPath !== ""
                        && !this.checkJsonObjPropertiesFilter(jsonObj, it, this.getJsonPropertyPath(jsonObjPath, it))
                    )
                )
                    continue;
                const subObj = jsonObj[it];
                const attrList = this.parseJSONAttributes(subObj)

                if (subObj === null || subObj === undefined) {
                    result.push(this.startTag(subObj, it, attrList, true));
                } else if (subObj instanceof Object) {
                    if (subObj instanceof Array) {
                        result.push(this.parseJSONArray(subObj, it, attrList, jsonObjPath));
                    } else if (subObj instanceof Date) {
                        result.push(this.startTag(subObj, it, attrList, false));
                        result.push(subObj.toISOString());
                        result.push(this.endTag(subObj, it));
                    } else {
                        const subObjElementsCnt = this.jsonXmlElemCount(subObj);
                        if (subObjElementsCnt > 0 || subObj.__text != null || subObj.__cdata != null) {
                            result.push(this.startTag(subObj, it, attrList, false));
                            result.push(this.parseJSONObject(subObj, this.getJsonPropertyPath(jsonObjPath, it)));
                            result.push(this.endTag(subObj, it));
                        } else {
                            result.push(this.startTag(subObj, it, attrList, true));
                        }
                    }
                } else {
                    result.push(this.startTag(subObj, it, attrList, false));
                    result.push(this.parseJSONTextObject(subObj));
                    result.push(this.endTag(subObj, it));
                }
            }
        }
        result.push(this.parseJSONTextObject(jsonObj));
        return result.join('');
    }

    parseXmlString(xmlDocStr) {
        const isIEParser = window.ActiveXObject || "ActiveXObject" in window;
        if (xmlDocStr === undefined) {
            return null;
        }
        let xmlDoc;
        if (window.DOMParser) {
            const parser = new window.DOMParser();
            let parsererrorNS = null;
            // IE9+ now is here
            if (!isIEParser) {
                try {
                    parsererrorNS = parser
                        .parseFromString("INVALID", "text/xml")
                        .getElementsByTagName("parsererror")[0].namespaceURI;
                } catch(err) {
                    parsererrorNS = null;
                }
            }
            try {
                xmlDoc = parser.parseFromString(xmlDocStr, "text/xml");
                if (
                    parsererrorNS != null
                    && xmlDoc.getElementsByTagNameNS(parsererrorNS, "parsererror").length > 0
                ) {
                    //throw new Error('Error parsing XML: '+xmlDocStr);
                    xmlDoc = null;
                }
            } catch(err) {
                xmlDoc = null;
            }
        } else {
            // IE :(
            if (xmlDocStr.indexOf("<?") === 0) {
                xmlDocStr = xmlDocStr.substr(xmlDocStr.indexOf("?>") + 2);
            }
            xmlDoc = new ActiveXObject("Microsoft.XMLDOM");
            xmlDoc.async = "false";
            xmlDoc.loadXML(xmlDocStr);
        }
        return xmlDoc;
    }


    asArray(prop) {
        if (prop === undefined || prop === null)
            return [];
        else if (prop instanceof Array)
            return prop;
        else
            return [prop];
    }

    toXmlDateTime(dt) {
        if (dt instanceof Date)
            return dt.toISOString();
        else if (typeof (dt) === 'number')
            return new Date(dt).toISOString();
        else
            return null;
    }

    asDateTime(prop) {
        return typeof (prop) === "string" ? this.fromXmlDateTime(prop) : prop;
    }

    xml2json(xmlDoc) {
        return this.parseDOMChildren(xmlDoc);
    }

    xml_str2json(xmlDocStr) {
        const xmlDoc = this.parseXmlString(xmlDocStr);
        return xmlDoc !== null ? this.xml2json(xmlDoc) : null;
    }

    // json to xml
    json2xml_str(jsonObj) {
        return this.parseJSONObject(jsonObj, "");
    }

    // json to xml
    json2xml(jsonObj) {
        const xmlDocStr = this.json2xml_str(jsonObj);
        return this.parseXmlString(xmlDocStr);
    }

    getVersion() {
        return this.VERSION;
    }
}

export default X2JS;
