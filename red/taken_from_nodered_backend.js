/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * @ignore
 **/

var NodeRedBackendCode = (function(){

    function normalisePropertyExpression(str, msg, toString) {
        // This must be kept in sync with validatePropertyExpression
        // in editor/js/ui/utils.js

        var length = str.length;
        if (length === 0) {
            throw createError("INVALID_EXPR","Invalid property expression: zero-length");
        }
        var parts = [];
        var start = 0;
        var inString = false;
        var inBox = false;
        var boxExpression = false;
        var quoteChar;
        var v;
        for (var i=0;i<length;i++) {
            var c = str[i];
            if (!inString) {
                if (c === "'" || c === '"') {
                    if (i != start) {
                        throw createError("INVALID_EXPR","Invalid property expression: unexpected "+c+" at position "+i);
                    }
                    inString = true;
                    quoteChar = c;
                    start = i+1;
                } else if (c === '.') {
                    if (i===0) {
                        throw createError("INVALID_EXPR","Invalid property expression: unexpected . at position 0");
                    }
                    if (start != i) {
                        v = str.substring(start,i);
                        if (/^\d+$/.test(v)) {
                            parts.push(parseInt(v));
                        } else {
                            parts.push(v);
                        }
                    }
                    if (i===length-1) {
                        throw createError("INVALID_EXPR","Invalid property expression: unterminated expression");
                    }
                    // Next char is first char of an identifier: a-z 0-9 $ _
                    if (!/[a-z0-9\$\_]/i.test(str[i+1])) {
                        throw createError("INVALID_EXPR","Invalid property expression: unexpected "+str[i+1]+" at position "+(i+1));
                    }
                    start = i+1;
                } else if (c === '[') {
                    if (i === 0) {
                        throw createError("INVALID_EXPR","Invalid property expression: unexpected "+c+" at position "+i);
                    }
                    if (start != i) {
                        parts.push(str.substring(start,i));
                    }
                    if (i===length-1) {
                        throw createError("INVALID_EXPR","Invalid property expression: unterminated expression");
                    }
                    // Start of a new expression. If it starts with msg it is a nested expression
                    // Need to scan ahead to find the closing bracket
                    if (/^msg[.\[]/.test(str.substring(i+1))) {
                        var depth = 1;
                        var inLocalString = false;
                        var localStringQuote;
                        for (var j=i+1;j<length;j++) {
                            if (/["']/.test(str[j])) {
                                if (inLocalString) {
                                    if (str[j] === localStringQuote) {
                                        inLocalString = false
                                    }
                                } else {
                                    inLocalString = true;
                                    localStringQuote = str[j]
                                }
                            }
                            if (str[j] === '[') {
                                depth++;
                            } else if (str[j] === ']') {
                                depth--;
                            }
                            if (depth === 0) {
                                try {
                                    if (msg) {
                                        var crossRefProp = getMessageProperty(msg, str.substring(i+1,j));
                                        if (crossRefProp === undefined) {
                                            throw createError("INVALID_EXPR","Invalid expression: undefined reference at position "+(i+1)+" : "+str.substring(i+1,j))
                                        }
                                        parts.push(crossRefProp)
                                    } else {
                                        parts.push(normalisePropertyExpression(str.substring(i+1,j), msg));
                                    }
                                    inBox = false;
                                    i = j;
                                    start = j+1;
                                    break;
                                } catch(err) {
                                    throw createError("INVALID_EXPR","Invalid expression started at position "+(i+1))
                                }
                            }
                        }
                        if (depth > 0) {
                            throw createError("INVALID_EXPR","Invalid property expression: unmatched '[' at position "+i);
                        }
                        continue;
                    } else if (!/["'\d]/.test(str[i+1])) {
                        // Next char is either a quote or a number
                        throw createError("INVALID_EXPR","Invalid property expression: unexpected "+str[i+1]+" at position "+(i+1));
                    }
                    start = i+1;
                    inBox = true;
                } else if (c === ']') {
                    if (!inBox) {
                        throw createError("INVALID_EXPR","Invalid property expression: unexpected "+c+" at position "+i);
                    }
                    if (start != i) {
                        v = str.substring(start,i);
                        if (/^\d+$/.test(v)) {
                            parts.push(parseInt(v));
                        } else {
                            throw createError("INVALID_EXPR","Invalid property expression: unexpected array expression at position "+start);
                        }
                    }
                    start = i+1;
                    inBox = false;
                } else if (c === ' ') {
                    throw createError("INVALID_EXPR","Invalid property expression: unexpected ' ' at position "+i);
                }
            } else {
                if (c === quoteChar) {
                    if (i-start === 0) {
                        throw createError("INVALID_EXPR","Invalid property expression: zero-length string at position "+start);
                    }
                    parts.push(str.substring(start,i));
                    // If inBox, next char must be a ]. Otherwise it may be [ or .
                    if (inBox && !/\]/.test(str[i+1])) {
                        throw createError("INVALID_EXPR","Invalid property expression: unexpected array expression at position "+start);
                    } else if (!inBox && i+1!==length && !/[\[\.]/.test(str[i+1])) {
                        throw createError("INVALID_EXPR","Invalid property expression: unexpected "+str[i+1]+" expression at position "+(i+1));
                    }
                    start = i+1;
                    inString = false;
                }
            }

        }
        if (inBox || inString) {
            throw new createError("INVALID_EXPR","Invalid property expression: unterminated expression");
        }
        if (start < length) {
            parts.push(str.substring(start));
        }

        if (toString) {
            var result = parts.shift();
            while(parts.length > 0) {
                var p = parts.shift();
                if (typeof p === 'string') {
                    if (/"/.test(p)) {
                        p = "'"+p+"'";
                    } else {
                        p = '"'+p+'"';
                    }
                }
                result = result+"["+p+"]";
            }
            return result;
        }

        return parts;
    }


    function getObjectProperty(msg,expr) {
        var result = null;
        var msgPropParts = normalisePropertyExpression(expr,msg);
        msgPropParts.reduce(function(obj, key) {
            result = (typeof obj[key] !== "undefined" ? obj[key] : undefined);
            return result;
        }, msg);
        return result;
    }


    const switchOperators = {
        'eq': function(a, b) { return a == b; },
        'neq': function(a, b) { return a != b; },
        'lt': function(a, b) { return a < b; },
        'lte': function(a, b) { return a <= b; },
        'gt': function(a, b) { return a > b; },
        'gte': function(a, b) { return a >= b; },
        'btwn': function(a, b, c) {
            return (a >= b && a <= c) || (a <= b && a >= c);
        },
        'cont': function(a, b) { return (a + "").indexOf(b) != -1; },
        'regex': function(a, b, c, d) {
            return (a + "").match(new RegExp(b,d?'i':''));
        },
        'true': function(a) { return a === true; },
        'false': function(a) { return a === false; },
        'null': function(a) { return (typeof a == "undefined" || a === null); },
        'nnull': function(a) { return (typeof a != "undefined" && a !== null); },
        'empty': function(a) {
            if (typeof a === 'string' || Array.isArray(a) ) {
                return a.length === 0;
            } else if (typeof a === 'object' && a !== null) {
                return Object.keys(a).length === 0;
            }
            return false;
        },
        'nempty': function(a) {
            if (typeof a === 'string' || Array.isArray(a) ) {
                return a.length !== 0;
            } else if (typeof a === 'object' && a !== null) {
                return Object.keys(a).length !== 0;
            }
            return false;
        },
        'istype': function(a, b) {
            if (b === "array") { return Array.isArray(a); }
            else if (b === "json") {
                try { JSON.parse(a); return true; }   // or maybe ??? a !== null; }
                catch(e) { return false;}
            }
            else if (b === "null") { return a === null; }
            else if (b === "number") { return typeof a === b && !isNaN(a) }
            else { return typeof a === b && !Array.isArray(a) && a !== null; }
        },
        'head': function(a, b, c, d, parts) {
            var count = Number(b);
            return (parts.index < count);
        },
        'tail': function(a, b, c, d, parts) {
            var count = Number(b);
            return (parts.count -count <= parts.index);
        },
        'index': function(a, b, c, d, parts) {
            var min = Number(b);
            var max = Number(c);
            var index = parts.index;
            return ((min <= index) && (index <= max));
        },
        'hask': function(a, b) {
            return a !== undefined && a !== null && (typeof b !== "object" )  &&  a.hasOwnProperty(b+"");
        },
        'jsonata_exp': function(a, b) { return (b === true); },
        'else': function(a) { return a === true; }
    };


    return {
        getObjectProperty: getObjectProperty,
        switchOperators: switchOperators
    }
})();
