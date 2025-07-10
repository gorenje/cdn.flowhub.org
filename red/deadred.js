//
// Very simple support for flow execution. Only those nodes that I have
// thought of are supported and even then not really.
//
// This implementation is very basic and certainly does not cover every
// edge case nor does it make a guarantee of correctness.
//
// This makes the assumption that RED is defined.
//
// License: Do anything with this code except evilness.
// Copyright: Gerrit Riessen, gerrit@openmindmap.org
//
var DEADRED = (function() {
    let stopExecution = false;
    let executionState = {};

    function clearStatusForNode(ndeid) {
        emitStatusForNode(ndeid,{})
    }

    function emitStatusForNode(ndeid,status) {
        RED.comms.emit([{ "topic":"status/" + ndeid, "data": status }])
    }

    function nodeTypeNotSupported(nde,details) {
        RED.notify(
            "Execution of type: " + nde.type + " ("+nde.id+") not supported" + ( details ? `: ${details}` : ""),
            "warning"
        );
    }

    function isNodeDebugCounter(nde) {
        return (
            nde.type == "debug" && nde.tostatus && (
                nde.statusType == "counter" || nde.statusType == "auto")
        )
    }

    function executeSubflow(msg, subflowId) {
        var subflow = RED.nodes.subflow(subflowId)

        if ( subflow.in.length > 0 ) {
            var startNode = RED.nodes.node(
                RED.nodes.getNodeLinks(subflow.in[0].id)[0].target.id
            )
            captureExceptionExecuteNode(startNode, msg)
        }
    }

    // code taken from
    // https://developer.mozilla.org/en-US/docs/Glossary/Base64#the_unicode_problem
    function base64ToBytes(base64) {
        const binString = atob(base64);
        return Uint8Array.from(binString, (m) => m.codePointAt(0));
    }

    function bytesToBase64(bytes) {
        const binString = String.fromCodePoint(...bytes);
        return btoa(binString);
    }

    function cloneIt(obj) {
        if ( typeof structuredClone != "undefined" ) { //looking at your Opera...
            try {
                return structuredClone(obj)
            } catch ( ex ) {
                return JSON.parse(JSON.stringify(obj))
            }
        } else {
            return JSON.parse(JSON.stringify(obj))
        }
    }

    function logExceptionToDebug(ex,nde,msg) {
        let debugMsg = {
            id:     nde.id,
            z:      nde.z,
            _alias: nde.id,
            path:   nde.z,
            name:   RED.utils.getNodeLabel(nde),
            topic:  msg.topic,
            msg:    JSON.stringify( { msg: msg, exception: ex } ),
            format: "Object"
        }

        setTimeout( () => {
            RED.comms.emit([{
                topic: "debug",
                data: debugMsg
            }])
        }, 500);
    }

    function msgTracerOnReceiveHook(evnt) {
        try {
            let nde = RED.nodes.node(evnt.destination.id)

            if ( !nde ) { return undefined }

            emitStatusForNode(nde.id, {
                "text": "msg " + (nde.type == "inject" ?
                                  "generated" : "received"),
                "fill": "grey",
                "shape":"ring"
            })

            var ndeid = nde.id
            setTimeout( () => { clearStatusForNode(ndeid) }, 1500);

            RED.comms.emit([{
                topic: "msgtracer:node-received",
                data: {
                    nodeid: evnt.destination.id
                }
            }])

            return nde
        } catch (ex) {
            console.error(ex)
        }
    }

    function msgTracerOnReceiveHookWithDebug(evnt) {
        try {
            let nde = msgTracerOnReceiveHook(evnt)

            // don't publish debug messages for junctions because they
            // cause errors in handleDebugMessages in the client.
            if ( !nde || nde.type == "junction") { return }

            let msg = {
                id:     nde.id,
                z:      nde.z,
                _alias: nde.id,
                path:   nde.z,
                name:   RED.utils.getNodeLabel(nde),
                topic:  evnt.msg.topic,
                msg:    evnt.msg
            }

            RED.comms.emit([{
                topic: "debug",
                data: msg
            }])

        } catch (ex) {
            console.error(ex)
        }
    }

    //
    // Main node handler. ExecuteNode modifies the message as required by the
    // node type, throwing up an error if the node isn't supported or passing
    // on the modified messages to the nodes links. This is called by the
    // main flow execution and by a subflow execution (see 'subflow' type below).
    //
    function executeNode(nde, msg) {
        // d ==> disabled
        if ( stopExecution || nde.d ) { return; }

        // clone the message, handle exceptions with shallower clone
        msg = cloneIt(msg)

        // emit an onReceive hook
        RED.hooks.trigger( "onReceive", { msg: msg, destination: nde } )

        // message tracing can be deactivated using the __notrace property
        // on the msg object.
        /* -- now using explicit message tracing.
        if ( !msg.__notrace ) {
            // don't overwrite the counter
            if ( !isNodeDebugCounter(nde) ) {
                emitStatusForNode(nde.id, {
                    "text": "msg " + (nde.type == "inject" ?
                                      "generated" : "received"),
                    "fill": "grey",
                    "shape":"ring"
                })

                var ndeid = nde.id
                setTimeout( () => { clearStatusForNode(ndeid) }, 1500);
            }
        }
        */

        // Start of subflow execution. This is done using a similar method
        // to the handling of link nodes: add an array to the message to
        // indicate that this is part of a subflow.
        var mth = nde.type.match(/^subflow:(.+)$/i)
        if ( mth ) {
            var ndeid = nde.id
            var evtId = "subevt:" + nde.id + ":" + mth[1]

            msg._subflowOut = msg._subflowOut || []
            msg._subflowOut.push(evtId)

            msg._subflowStatus = msg._subflowStatus || []
            msg._subflowStatus.push(evtId)

            executeSubflow(msg, mth[1])

            return
        }

        // Within the swith, a 'break' will cause an error message explaining
        // that the node is not supported. A 'return' will mean the node
        // has been completely applied.
        switch ( nde.type ) {
            case 'base64':
                if ( nde.action == "b64" ) {
                    var atobUtf8 = (content) => {
                        return new TextDecoder().decode(base64ToBytes(content));
                    };

                    RED.utils.setMessageProperty(
                        msg,
                        nde.property,
                        atobUtf8(RED.utils.getMessageProperty(
                            msg, nde.property
                        ))
                    )

                    passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg);
                    return
                }

                if ( nde.action == "str" ) {
                    var btoaUtf8 = (content) => {
                        return bytesToBase64(new TextEncoder().encode(content))
                    }

                    RED.utils.setMessageProperty(
                        msg,
                        nde.property,
                        btoaUtf8(RED.utils.getMessageProperty(
                            msg, nde.property
                        ))
                    )

                    passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg);
                    return
                }

                if ( nde.action == "" ) {
                    var val = RED.utils.getMessageProperty(
                        msg, nde.property
                    )

                    if ( typeof val == "string" ) {
                        RED.utils.setMessageProperty(
                            msg,
                            nde.property,
                            base64ToBytes(val)
                        )

                        passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg);
                        return

                    } else if ( typeof val == "object") {
                        RED.utils.setMessageProperty(
                            msg,
                            nde.property,
                            bytesToBase64(val)
                        )

                        passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg);
                        return

                    } else if ( !val ) {
                        // silently ignore doing anything
                        passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg);
                        return
                    }
                }

                break

            case "ClientCode":
                let ccCode = msg.clientcode || nde.clientcode

                RED.comms.emit([{
                    "topic":"introspect:client-code-perform",
                    "data":{
                        "msg":     "execfunc",
                        "payload": msg.payload,
                        "topic":   msg.topic,
                        "func":    ccCode,
                        "nodeid":  nde.id,
                        "_msg":    { ...msg },
                        "format":  `string[${ccCode.length}]`
                    }
                }])

                return;

            case "change":
                nde.rules.forEach( rle => {
                    if ( rle.t == "set" ) {
                        if ( rle.pt == "msg" && rle.tot == "str" ) {
                            msg[rle.p] = rle.to
                        }
                        if ( rle.pt == "msg" && rle.tot == "bool" ) {
                            msg[rle.p] = (rle.to === "true")
                        }
                        if ( rle.pt == "msg" && rle.tot == "num" ) {
                            msg[rle.p] = Number(rle.to)
                        }
                        if ( rle.pt == "msg" && rle.tot == "json" ) {
                            msg[rle.p] = JSON.parse(rle.to)
                        }
                        if ( rle.pt == "msg" && rle.tot == "jsonata" ) {
                            msg[rle.p] = jsonata(rle.to.replace(/\$\$[.]/g,"$").replace(/msg[.]/g,"$")).evaluate(msg,msg)
                        }
                        if ( rle.pt == "msg" && rle.tot == "msg" ) {
                            RED.utils.setMessageProperty(
                                msg,
                                rle.p,
                                RED.utils.getMessageProperty(msg, rle.to)
                            )
                        }
                    }

                    if ( rle.t == "delete" && rle.pt == "msg" ) {
                        delete msg[rle.p];
                    }
                })

                passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg);
                return

            case "csv":

                if ( typeof msg.payload == "object" ) {
                    var cfg = {
                        header: nde.hdrout != "none",
                        newline: nde.ret,
                    }

                    if ( !Array.isArray(msg.payload) ) {
                        msg.payload = [msg.payload]
                    }

                    msg.payload = Papa.unparse( msg.payload, cfg )
                    passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg)

                    return
                } else {
                    var cfg = {
                        delimiter: nde.spe,
                        skipFirstNLines: parseInt(nde.skip),
                        header: nde.hdrin,
                        skipEmptyLines: !nde.include_empty_strings,
                    }

                    if ( nde.multi == "one" ) {
                        Papa.parse( msg.payload, cfg ).data.forEach( d => {
                            msg = cloneIt(msg)
                            msg.payload = d
                            msg._msgid = RED.nodes.id()
                            passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg);
                        })
                    } else {
                        msg.payload = Papa.parse( msg.payload, cfg ).data
                        passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg);
                    }

                    return
                }

                break

            case "debug":
                if ( !nde.active ) { return }

                let donesomething = false;

                if ( nde.console ) {
                    console.log( "Debug [console log]", msg)
                    donesomething = true
                }

                if ( nde.tosidebar ) {
                    var debugData = {
                        "id":       nde.id,
                        "z":        nde.z,
                        "path":     nde.z,
                        "name":     nde._def.label.call(nde),
                        "topic":    msg.topic,
                        "property": "",
                        "msg":      JSON.stringify(msg),
                        "format":   "Object"
                    }

                    if ( nde.complete != "true" ) {
                        if (nde.complete == "false"){ nde.complete = "payload" }
                        debugData["property"] = nde.complete

                        var val = RED.utils.getMessageProperty(
                            msg, nde.complete
                        )

                        if ( val == undefined ) {
                            debugData["msg"] = val
                            debugData["format"] = "string[0]"
                        } else if ( typeof val === "string" ) {
                            debugData["msg"] = val
                            debugData["format"] = "string[" + val.length + "]"
                        } else if ( Array.isArray(val) ) {
                            debugData["msg"] = JSON.stringify(val)
                            debugData["format"] = "array[" + val.length + "]"
                        } else if ( val.__proto__ == Uint8Array.prototype ) {
                            debugData["format"] = "array[" + val.length + "]"
                            val = Array.of( ...val )
                            debugData["msg"] = JSON.stringify(val)
                        } else {
                            debugData["msg"] = JSON.stringify(val)
                            debugData["format"] = "Object"
                        }
                    }

                    // if a debug appears in a subflow, it needs to have
                    // more details to identify it.
                    if ( msg._subflowOut && msg._subflowOut.length > 0 ) {
                        var evnt      = msg._subflowOut[msg._subflowOut.length-1]
                        var origNdeId = evnt.split(":")[1]
                        var wrkSpId   = RED.nodes.node(origNdeId).z

                        debugData["_alias"] = nde.id
                        debugData["id"]     = origNdeId + "-" + nde.id
                        debugData["z"]      = origNdeId
                        debugData["path"]   = wrkSpId + "/" + origNdeId
                    }

                    RED.comms.emit([{ "topic": "debug", "data": debugData }])
                    donesomething = true
                }

                if( isNodeDebugCounter(nde) ) {
                    executionState[nde.id] = executionState[nde.id] || {
                        cnt: 0
                    }
                    executionState[nde.id]["cnt"] += 1

                    let txt = executionState[nde.id]["cnt"];
                    if ( nde.statusType == "auto" ) {
                        txt = JSON.stringify( msg )
                    }

                    emitStatusForNode(nde.id, {
                        "text": txt,
                        "fill":"blue",
                        "shape":"ring"
                    })
                    donesomething = true
                }

                if ( donesomething ) return

                break

            case "delay":

                if ( nde.pauseType === "delayv" ) {
                    var vDur = Number( msg.delay )
                    vDur = vDur > 0 ? vDur : 0

                    setTimeout( () => {
                        passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg)
                    }, vDur);

                    return
                }

                if ( nde.pauseType === "delay" ) {
                    let duration = nde.timeout * 1000;

                    if (nde.timeoutUnits === "milliseconds") {
                        duration = nde.timeout;
                    } else if (nde.timeoutUnits === "minutes") {
                        duration = nde.timeout * (60 * 1000);
                    } else if (nde.timeoutUnits === "hours") {
                        duration = nde.timeout * (60 * 60 * 1000);
                    } else if (nde.timeoutUnits === "days") {
                        duration = nde.timeout * (24 * 60 * 60 * 1000);
                    }

                    setTimeout( () => {
                        passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg)
                    }, duration);

                    return
                }

                if ( nde.pauseType === "random" ) {
                    let rFirst = nde.randomFirst * 1000;
                    let rLast = nde.randomLast * 1000;

                    if (nde.randomUnits === "milliseconds") {
                        rFirst = nde.randomFirst * 1;
                        rLast = nde.randomLast * 1;
                    } else if (nde.randomUnits === "minutes") {
                        rFirst = nde.randomFirst * (60 * 1000);
                        rLast = nde.randomLast * (60 * 1000);
                    } else if (nde.randomUnits === "hours") {
                        rFirst = nde.randomFirst * (60 * 60 * 1000);
                        rLast = nde.randomLast * (60 * 60 * 1000);
                    } else if (nde.randomUnits === "days") {
                        rFirst = nde.randomFirst * (24 * 60 * 60 * 1000);
                        rLast = nde.randomLast * (24 * 60 * 60 * 1000);
                    }

                    setTimeout( () => {
                        passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg)
                    }, rFirst + ((rLast - rFirst) * Math.random()));

                    return
                }

                break

            case "http request":
                if ( nde.method == "GET" ) {
                    let url = msg.url || nde.url

                    let hdrs = {};
                    (nde.headers || []).forEach( hdr => {
                        hdrs[hdr.keyValue || hdr.keyType] = (
                            hdr.valueValue || hdr.valueType
                        )
                    })
                    hdrs = { ...hdrs, ...(msg.headers || {}) }

                    let typeFromRet = (ret) => {
                        if ( ret == "txt" ) {
                            return "text"
                        } else if ( ret == "obj" ) {
                            return "json"
                        } else {
                            return undefined
                        }
                    }

                    $.get({
                        url: url,
                        headers: hdrs,
                        dataType: typeFromRet(nde.ret),
                        crossOrigin: true,
                    }).done( data => {
                        if ( nde.ret == "txt" ) {
                            msg.payload = data.toString("utf8")
                        } else if ( nde.ret == "bin" ) {
                            msg.payload = data
                        } else {
                            msg.payload = data
                        }
                        passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg)
                    }).fail( data => {
                        RED.notify( "Error requesting: " + url, "error")
                        console.log( "error requesting: " + url, data )
                    })
                    return
                }

                break

            case "join":
                if ( nde.mode == "custom" && nde.build == "array" &&
                     (nde.propertyType == "msg" || nde.propertyType == "full")) {

                    executionState[nde.id] = executionState[nde.id] || []

                    if ( nde.propertyType == "full" ) {
                        executionState[nde.id].push( msg )
                    } else {
                        executionState[nde.id].push( msg[nde.property] )
                    }

                    if ( executionState[nde.id].length == parseInt(nde.count) ) {
                        msg.payload = [...executionState[nde.id]];
                        delete executionState[nde.id]
                        passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg);
                    }
                    return;
                }

                break

            case "json":
                let data = msg[nde.property]

                let toStr = (d,p) => {
                    if ( p ) {
                        return JSON.stringify(d, null, 4)
                    } else {
                        return JSON.stringify(d)
                    }
                }

                if ( nde.action == "" ) {
                    if ( typeof data == "string" ) {
                        msg[nde.property] = JSON.parse(data)
                    } else {
                        msg[nde.property] = toStr(data,nde.pretty)
                    }
                } else if ( nde.action == "str" ) {
                    msg[nde.property] = toStr(data,nde.pretty)
                } else {
                    msg[nde.property] = JSON.parse(data)
                }

                passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg);
                return

            case "link call":
                // TOOD: ------
                // TODO: handle the timeout value set on the node
                // TODO: ------

                msg._linkSource = msg._linkSource || []
                msg._linkSource.push( nde.id )

                if ( nde.linkType == "static" ) {
                    nde.links.forEach( ndeid => {
                        captureExceptionExecuteNode(RED.nodes.node(ndeid), msg)
                    })
                }

                if ( nde.linkType == "dynamic" ) {
                    if ( msg.target ) {
                        var mth = msg.target.match(/^([a-z0-9]{16})$/i)
                        if ( mth ) {
                            captureExceptionExecuteNode(
                                RED.nodes.node(mth[1]), msg
                            )
                            return
                        }

                        var foundNode = false
                        RED.nodes.eachNode( nde => {
                            if ( nde.name === msg.target ) {
                                captureExceptionExecuteNode(nde, msg)
                                foundNode = true
                            }
                        })
                        if ( foundNode ) return
                    }

                    RED.notify(
                        "Target not found Link Call ("+ nde.id +")", "error"
                    )
                }

                return

            case "link out":

                if ( nde.mode == "link" ) {
                    nde.links.forEach( ndeid => {
                        // if you end up here with a node that was null, then
                        // the link out node has stale links -- i.e. node ids
                        // that no longer exist in the flow.
                        var trgNde = RED.nodes.node(ndeid)
                        if ( !trgNde ) {
                            console.warn(
                                "Missing node for link id: " + ndeid +
                                " stale flow, check link out node: " + nde.id
                            )
                        } else {
                            captureExceptionExecuteNode(trgNde, msg)
                        }
                    })
                    return
                }

                if ( nde.mode == "return" ) {
                    let lnkndeid = msg._linkSource.pop()

                    if ( lnkndeid ) {
                        // don't execute the node at the end of the lnkndeid
                        // since it's a link call node, so we pass the message
                        // on to all the wires connected to the link call node
                        passMsgToLinks(RED.nodes.getNodeLinks(
                            RED.nodes.node(lnkndeid)
                        ), msg);
                    } else {
                        RED.notify(
                            "Error: got to link return but no nodeid","error"
                        )
                        console.log( "no linkSource for return", [nde, msg])
                    }

                    return
                }

                break

            case 'subflow':
                // we get here from the inside of a subflow. A subflow
                // calls this and eventually it ends with an out node
                // which then triggers the original node with the msg.
                // The status node triggers a status update for the original
                // node.
                if ( nde.direction == "out" ) {
                    var evtId = msg._subflowOut.pop()
                    var ndeId = evtId.split(":")[1]

                    passMsgToLinks(RED.nodes.getNodeLinks(
                        RED.nodes.node(ndeId)
                    ), msg);

                    return
                }

                if ( nde.direction == "status" ) {
                    var evtId = msg._subflowStatus.pop()
                    var ndeId = evtId.split(":")[1]

                    if ( typeof msg.status == "object" ) {
                        emitStatusForNode(ndeId, msg.status)
                    }

                    return
                }

                break

            case 'switch':

                if ( nde.property && nde.propertyType == "msg" ) {

                    let val = RED.utils.getMessageProperty(
                        msg,nde.property
                    )

                    let correctness = nde.rules.map( rle => {
                        let tst = NodeRedBackendCode.switchOperators[rle.t] || (() => {return false})

                        try {
                            return tst(val,rle.v,rle.v2)
                        } catch (ex) {
                            logExceptionToDebug(ex,nde,msg)
                            return false
                        }
                    })

                    let lnks = []

                    if ( nde.checkall == "true" ) {
                        RED.nodes.getNodeLinks( nde ).forEach( lnk => {
                            if ( correctness[lnk.sourcePort] ) {
                                lnks.push( lnk )
                            }
                        })
                    } else {
                        for ( var idx = 0 ; idx < correctness.length ; idx++){
                            if ( correctness[idx] ) {
                                RED.nodes.getNodeLinks( nde ).forEach( lnk => {
                                    if ( lnk.sourcePort == idx ) lnks.push(lnk)
                                })
                                break
                            }
                        }
                    }

                    passMsgToLinks(lnks, msg);
                    return
                } else {
                    nodeTypeNotSupported(nde, "propertyType can only be msg")
                    return
                }

                break

            case "template":
                if ( nde.output != "str" ) {
                    nodeTypeNotSupported(nde, "output may only be <b>plain text</b>")
                    return
                }

                if ( nde.fieldType != "msg" ) {
                    nodeTypeNotSupported(nde, `unsupported field type <b>${nde.fieldType}</b>`)
                    return
                }

                if ( nde.syntax == "plain" ) {
                    msg[nde.field] = nde.template
                } else if ( nde.syntax == "mustache" ) {
                    msg[nde.field] = window.Mustache.render(nde.template,msg)
                } else {
                    nodeTypeNotSupported(nde, `Unknown format: <b>${nde.syntax}</b>`)
                    return
                }

                passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg);

                return

            case "yaml":
                let yamlData = msg[nde.property]

                if ( typeof yamlData === "object" ) {
                    msg[nde.property] = jsyaml.dump(yamlData)
                } else {
                    msg[nde.property] = jsyaml.load(yamlData)
                }

                passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg);
                return

            case 'xml':

                let xmlData = msg[nde.property]

                if ( typeof xmlData == "string" ) {
                    msg[nde.property] = window.x2js.xml_str2json(xmlData)
                } else if ( typeof xmlData == "object" ) {
                    msg[nde.property] = window.x2js.json2xml_str(xmlData)
                }

                passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg);
                return

            //
            // leave the inject here, it falls through, i.e. no break or return
            //
            case "inject":

                var handleType = (nde,prp,msg) => {
                    switch ( prp.vt ) {
                        case "num":
                            msg[prp.p] = Number( prp.v )
                            break

                        case "bool":
                        case "json":
                            msg[prp.p] = JSON.parse( prp.v )
                            break

                        case "jsonata":
                            msg[prp.p] = jsonata(prp.v.replace(/\$\$[.]/g,"$").replace(/msg[.]/g,"$")).evaluate(msg,msg)
                            break

                        case "str":
                            msg[prp.p] = prp.v
                            break

                        case "date":
                            msg[prp.p] = Date.now()
                            break

                        case "bin":
                            var data = JSON.parse(prp.v);
                            if (Array.isArray(data) || (typeof(data) === "string")) {
                                msg[prp.p] = new ArrayBuffer(data);
                            }
                            else {
                                // TODO: generate error here.
                            }
                            break
                    }
                };

                // __user_inject_props__ is generated by the "inject now" button
                // on the inject node - it's designed to dynamically inject
                // data into the flow without redeployment
                nde.props.concat(msg.__user_inject_props__ || []).forEach(prp => {
                    if ( prp.p == "payload" ) {
                        handleType(nde, { p: prp.p,
                                          v: nde.payload,
                                          vt: nde.payloadType }, msg)
                    } else if ( prp.p == "topic" ) {
                        handleType(nde, { p: prp.p,
                                          v: prp.v || nde.topic,
                                          vt: prp.vt }, msg)
                    } else {
                        handleType(nde, prp, msg)
                    }
                })

                delete msg.__user_inject_props__

                // Intentionally no break or return here, its meant to
                // fall through.

            case "link in":
            case "junction":
                passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg);
                return;
        }

        nodeTypeNotSupported(nde)
    }

    // as the name says: capture the exceptions during execution
    function captureExceptionExecuteNode(nde, msg) {
        if ( !nde ) {
            console.error( "captureExceptionExecuteNode: Node was null", msg)
            return
        }

        try {
            executeNode(nde, msg)
        } catch ( ex ) {
            RED.notify( `Error executing '${RED.utils.getNodeLabel(nde)}' of type '${nde.type}' with id ${nde.id}: ${ex.message}`, "error");
            logExceptionToDebug(ex,nde,msg)
        }
    }

    function passMsgToLinks(links, msg) {
        links.forEach( lnk => {
            let nde = (
                RED.nodes.node(lnk.target.id) ||
                RED.nodes.junction(lnk.target.id)
            )
            // this is the end of a subflow run
            if ( !nde && lnk.target.type == "subflow" ) {
                nde = lnk.target
            }

            // this should not happen and if it does, then we're dealing
            // with some monster.
            if ( !nde ) {
                console.error("*** NO target found for LINK", lnk)
            }
            // off-thread
            setTimeout( () => {
                captureExceptionExecuteNode(nde, cloneIt(msg))
            },0)
        })
    }

    // this is the functionality for the flow compare sidebar - FlowCompareCfg
    // It's the same as the found in the FlowCompare node -->
    // https://flows.nodered.org/node/@gregoriusrippenstein/node-red-contrib-flowcompare
    function compareFlows(msg) {
        var oldFlowRevision = {};
        var newFlowRevision = {};

        for (var idx = 0; idx < msg.payload.length; idx++) {
            oldFlowRevision[msg.payload[idx].id] = msg.payload[idx]
        }

        for (var idx = 0; idx < msg.new_flowdata.length; idx++) {
            newFlowRevision[msg.new_flowdata[idx].id] = msg.new_flowdata[idx]
        }

        var changes = []

        /* nodes that have been deleted */
        for (var idx = 0; idx < msg.payload.length; idx++) {
            var oldObj = msg.payload[idx];

            if (!newFlowRevision[oldObj.id]) {
                changes.push({
                    type: "deleted",
                    id: oldObj.id,
                    oldObj: oldObj,
                    newObj: undefined
                })
            }
        }

        for (var idx = 0; idx < msg.new_flowdata.length; idx++) {
            var newObj = msg.new_flowdata[idx];
            var oldObj = oldFlowRevision[newObj.id];

            if (!oldObj) {
                changes.push({
                    type: "added",
                    id: newObj.id,
                    oldObj: undefined,
                    newObj: newObj
                })
            } else {
                if (JSON.stringify(oldObj) != JSON.stringify(newObj)) {
                    changes.push({
                        type: "changed",
                        id: newObj.id,
                        oldObj: oldObj,
                        newObj: newObj
                    })
                }
            }
        }

        return changes;
    }

    // redirect those requests that demonstrate certain functionality
    // to the deadred server.
    let deadredRedirectablesAjax = [
        "NodeFactorySidebarCfg"
    ];

    // we assume that RED is defined.
    $.ajaxPrefilter(function( options, originalOptions, jqXHR ) {
        let mth = undefined;

        // patial functionality provided by the deadred backend
        if ( deadredRedirectablesAjax.indexOf( options.url ) > -1 ) {
            options.url = RED.settings.get("dynamicServer", "") + options.url
        }

        if ( options.url == "FlowHubDiff" ) {
            jqXHR.abort()

            let cfgNode = undefined

            RED.nodes.eachConfig( nd => {
                if ( nd.type == "FlowHubCfg" ) {
                    cfgNode = nd
                }
            })

            $.ajax({
                type: "POST",
                dataType: "json",
                contentType: "application/json",
                headers: {
                    "FlowHub-API-Version": "brownbear",
                    "X-FHB-TOKEN": cfgNode.apiToken
                },
                url: RED.settings.get("dynamicServer", "") + "v1/diff",
                data: options.data,
                success: options.success
            });
        }

        if ( options.url == "FlowHubPush" ) {
            options.success({})
            jqXHR.abort()

            let cfgNode = undefined

            RED.nodes.eachConfig( nd => {
                if ( nd.type == "FlowHubCfg" ) {
                    cfgNode = nd
                }
            })

            if ( cfgNode && cfgNode.apiToken != "" ) {
                let data = JSON.parse(options.data)

                let postData = {
                    flowid:       data.flowid,
                    flowdata:     data.flowdata,
                    flowlabel:    data.flowlabel,
                    svgdata:      data.svgdata,
                    nodedetails:  data.nodedetails,
                    flowrevision: (cfgNode.flowrevisions || {})[data.flowid] || "",
                    pushcomment:  cfgNode.pushcomment,
                    pushnewflows: JSON.parse(cfgNode.pushnewflows),
                    forcepush:    JSON.parse(cfgNode.forcepush),
                }

                $.ajax({
                    type: "POST",
                    dataType: "json",
                    contentType: "application/json",
                    headers: {
                        "Authorization": "Bearer " + cfgNode.apiToken
                    },
                    url: RED.settings.get("dynamicServer", "") + "v1/flows",
                    data: JSON.stringify(postData),
                    success: (resp) => {
                        // update the revision of the flow locally if it has changed
                        // remotely
                        if ( resp.status == "nochange"
                            && cfgNode.flowrevisions
                            && cfgNode.flowrevisions[resp.flowid] != resp.revision
                            && resp.revision != "") {
                            cfgNode.flowrevisions[resp.flowid] = resp.revision
                        }

                        // update of flow was made,
                        if ( resp.status == "ok" ) {
                            cfgNode.flowrevisions[resp.flowid] = resp.revision
                        }

                        RED.comms.emit([
                            {
                                topic: "flowhub:submission-result",
                                data: {
                                    status: resp.msg,
                                    statusType: resp.status == "failed" ? "error" : "success",
                                }
                            }
                        ])
                    },
                });
            } else {
                setTimeout( () => {
                    RED.comms.emit([
                        {
                            topic: "flowhub:submission-result",
                            data: {
                                status: "No FlowHub.org token set - <a target=_blank href='https://flowhub.org/integration'>Get your token <i class='fa fa-external-link'></i></a>.",
                                statustype: "error"
                            }
                        }
                    ])
                }, 1234)
            }

            return
        }

        // Token retrieval
        mth = options.url.match(/^FlowHubToken/i)
        if ( mth ) {
            let cfgNode = undefined

            RED.nodes.eachConfig( nd => {
                if ( nd.type == "FlowHubCfg" ) {
                    cfgNode = nd
                }
            })

            options.success({
                "token": (cfgNode ? cfgNode.apiToken : "xxx"),
            })

            jqXHR.abort();
        }

        // handle the FlowCompare functionality locally since we store
        // the flow data on deploy - extract what is being compared from there.
        mth = options.url.match(/^FlowCompareCfg/i)
        if ( mth ) {
            var data = JSON.parse( options.data )
            var lcl = JSON.parse( RED.settings.getLocal("flowdata"))

            var lclnodes = []
            lcl.flows.forEach( nde => {
                if ( nde.id == data.flowid || nde.z == data.flowid ) {
                    lclnodes.push(nde)
                }
            })

            options.success({
                "status": "ok",
                "flowid": data.flowid,
                "nodes": lclnodes,
                "changes": compareFlows({
                    payload: lclnodes,
                    new_flowdata: data.flowdata
                })
            })

            jqXHR.abort();
        }

        // handle the MsgTracer functionality
        mth = options.url.match(/^MsgTracer\/msgtracing\/(.+)/i)
        if ( mth ) {
            let state = mth[1]
            let req = {
                body: JSON.parse(options.data)
            }

            const OnReceiveHookName = "onReceive.introspectionMsgTracer"

            try {
                RED.hooks.remove(OnReceiveHookName)

                if ( state == "on" ) {
                    if ( req.body.withDebug ) {
                        RED.hooks.add(OnReceiveHookName, msgTracerOnReceiveHookWithDebug)
                    } else {
                        RED.hooks.add(OnReceiveHookName, msgTracerOnReceiveHook)
                    }
                }

                options.success({})
            } catch (err) {
                console.log( err )
                options.error({})
            }

            jqXHR.abort();
        }

        mth = options.url.match(/^MsgTracer\/debug\/(.+)/i)
        if ( mth ) {
            let state = mth[1]
            let req = {
                body: JSON.parse(options.data)
            }

            const OnReceiveHookName = "onReceive.introspectionMsgTracer"

            try {
                RED.hooks.remove(OnReceiveHookName)

                if ( state == "on" ) {
                    RED.hooks.add(OnReceiveHookName, msgTracerOnReceiveHookWithDebug)
                }

                options.success({})
            } catch (err) {
                console.log( err )
                options.error({})
            }

            jqXHR.abort();
        }

        // handle the client code node callbacks, there are two:
        // one for the status and one for sending on messages.
        mth = options.url.match(/^ClientCode\/([a-z0-9]{16})\/?(.+)?/i)
        if ( mth ) {
            if ( mth[2] == "status" ) {
                // this is a node.status(...) call
                RED.comms.emit([{
                    "topic":"status/" + mth[1],
                    "data": JSON.parse(options.data)
                }])
                jqXHR.abort();
            } else if ( mth[2] == "ugify" ) {
                // used by the obfuscation endpoint
                options.success([])
                jqXHR.abort();
            } else {
                // this is a node.send(...) call
                passMsgToLinks(
                    RED.nodes.getNodeLinks( RED.nodes.node(mth[1]) ),
                    JSON.parse(options.data)
                );
                jqXHR.abort();
            }
        }

        // This is for FlowHub push, it requires a list of installed nodes
        // for package dependency tracking.
        if ( options.url == "nodes" ) {
            options.url = "nodes/nodes.json"
        }

        // if an inject button does get pressed, simulate a flow execution
        // but with only specific nodes being supported.
        mth = options.url.match(/^inject\/([a-z0-9]{16})/i)
        if ( mth ) {
            jqXHR.abort();
            options.success({})

            var ndeid = mth[1];
            var data = options.data;
            // execute off-thread ...
            setTimeout( () => {
                DEADRED.executeFlow(ndeid, JSON.parse(data))
            }, 10);
        }

        // capture disable and enable events for the debug node
        mth = options.url.match(/^debug\/([a-z0-9]{16})\/?(.+)?/i)
        if ( mth ) {
            jqXHR.abort();
            options.success({},"",{ status: mth[2] == "enable" ? 200 : 201 })
        }

        // locales and messages - convert parameter to be part of the file
        // name - differentiate between languages on a _static_ server.

        // LoCaLeS is taken from retrieve.sh and should be kept in sync.
        const LoCaLeS="en-US en-GB en de-DE de fr ja ko pt-BR ru zh-CN zh-TW"

        // convert from /messages?lng=xx-YY to /messages.xx-YY but this means
        // missing locale files will halt loading of the editor (at loading
        // plugins) so we need to ensure the locale files for a specific locale
        // _always_ exist. (Conversion to .xx-YY allows for support of
        // multiple locales on a _static_ server).
        mth = options.url.match(/^(nodes|plugins)\/messages/i)
        if ( mth ) {
            var d = new URLSearchParams(options.url.split("?")[1])
            if ( LoCaLeS.split(/[\t \n]+/).indexOf(d.get("lng")) > -1 ) {
                options.url = mth[1] + "/messages." + d.get("lng")
            }
        }

        // Handle the contact conversion request
        mth = options.url.match(/^vCardContactSidebarCfg/i)
        if ( mth && options.type == "POST" ) {
            let handleUrlEmail = (ary) => {
                let typeStr = [(ary[1]["type"] || [])].flat().join(",").toUpperCase()

                if ( typeStr != "" ) {
                    return `${ary[0].toUpperCase()};TYPE=${typeStr}:${ary[3].replace(/\n/g," ")}`
                } else {
                    return `${ary[0].toUpperCase()}:${ary[3].replace(/\n/g," ")}`
                }
            }

            let handleStr = (ary) => {
                return `${ary[0].toUpperCase()}:${ary[3].replace(/\n/g," ")}`
            }

            let handleNvalue = (ary) => {
                return `${ary[0].toUpperCase()}:${ary[3].join(";").replace(/\n/g," ")}`
            }

            let handlePhoto = (ary) => {
                return `${ary[0].toUpperCase()};ENCODING=${ary[1]['encoding'].toUpperCase()};TYPE=${ary[1]['type'].toUpperCase()}:${ary[3]}`
            }

            let loopThrAttrs = (attr, data, entry, fn) => {
                data.forEach( ary => {
                    if ( ary[0].toUpperCase() == attr ) { entry.push( fn(ary) ) }
                })
            }

            let result = JSON.parse(options.data).rawjsondata.map( str => {
                let entry = ["BEGIN:VCARD"]
                let data = JSON.parse(str)[1]

                let lst = ["VERSION","PRODID","FN","ORG","TITLE","BDAY","NOTE"]
                lst.forEach( attr => { loopThrAttrs( attr, data, entry, handleStr ) })

                lst = ["N"]
                lst.forEach( attr => { loopThrAttrs( attr, data, entry, handleNvalue ) } )

                lst = ["EMAIL","URL"]
                lst.forEach( attr => { loopThrAttrs( attr, data, entry, handleUrlEmail ) } )

                lst = ["PHOTO"]
                lst.forEach( attr => { loopThrAttrs( attr, data, entry, handlePhoto ) } )

                entry.push( "END:VCARD" )
                return entry.join("\n")
            })

            options.success({ data: { vcards: result.join("\n") } }, "",{ status: 200 })
            jqXHR.abort()
        }

        // a click on the deploy button, an update of the flow. Pass
        // through but handle a reload and stop the flows.
        if ( options.url == (RED.settings.get("dynamicServer", "") + "flows")
          && options.type == "POST") {
            if ( options.headers &&
                 options.headers["Node-RED-Deployment-Type"] == "reload" ) {
                reloadFlows()
            } else {
                RED.settings.setLocal( "flowdata", options.data)
            }
        }
    });

    //
    // Used to highlight the links in markdown text - links that highlight
    // nodes in the flow. This is used for documentational purposes, see
    // https://discourse.nodered.org/t/highlighting-nodes-and-groups-from-the-info-text-box/84020
    // for details
    //
    function handleTextReferences() {
        var getDataIds = (ele) => {
            return ($(ele).data("ids") || $(ele).data("id") || "").split(",");
        };

        var setHrefClass = (ele) => {
            $(ele).attr('href', '#');
            $(ele).addClass('ahl');
        };

        var nodesInGrp = (grpId) => {
            var ndeIds = []
            let ndsInGrp = RED.nodes.group(grpId) || { nodes: [] }
            ndsInGrp.nodes.forEach( n => {
                if ( n.type == "group" ) {
                    ndeIds = ndeIds.concat( nodesInGrp(n.id) )
                } else {
                    ndeIds.push(n.id)
                }
            })
            return ndeIds
        };

        var highlightNodes = (ndeIds) => {
            // move the workspace to the first node of
            // the group but don't make the highlight blink
            RED.view.reveal(ndeIds[0], false)
            RED.view.redraw();

            RED.tray.hide();
            RED.view.selectNodes({
                selected: ndeIds,
                onselect: function(selection) { RED.tray.show(); },
                oncancel: function() { RED.tray.show(); }
            });
        };

        $('a.ahl-node-only').each(function (idx, ele) {
            setHrefClass(ele);
            $(ele).removeClass('ahl-node-only');
            $(ele).css('color', '#f4a0a0')

            var ndeIds = getDataIds(ele);

            $(ele).on('click', function (e) {
                if ( ndeIds.length == 1 ) {
                    RED.view.reveal(ndeIds[0], true)
                    RED.view.redraw();
                } else {
                    highlightNodes(ndeIds)
                }
            });
        });

        $('a.ahl-group-only').each(function (idx, ele) {
            setHrefClass(ele);
            $(ele).removeClass('ahl-group-only');
            $(ele).css('color', '#f4a0a0')

            // here the ids are group ides, need to find all nodes in those
            // groups and highlight them
            var grpIds = getDataIds(ele);
            var ndeIds = []
            grpIds.forEach( grpId => {
                ndeIds = ndeIds.concat( nodesInGrp( grpId ) )
            })

            $(ele).on('click', function (e) {
                if ( ndeIds.length == 1 ) {
                    RED.view.reveal(ndeIds[0], true)
                    RED.view.redraw();
                } else {
                    highlightNodes(ndeIds)
                }
            });
        });
    }

    // called once the deploy restart flow is called.
    function reloadFlows() {
        stopExecution = true;

        setTimeout( () => {
            stopExecution = false
            executionState = {};
            RED.nodes.eachNode( (nde) => { clearStatusForNode(nde.id) });
        }, 2000);
    }

    // this is called by inject when its button is pressed...
    function executeFlow(nodeid, msg) {
        let nde = RED.nodes.node(nodeid)
        if ( nde.type == "inject" ) {
            msg._msgid = RED.nodes.id()
            captureExceptionExecuteNode(nde, msg)
        }
    }

    function init() {
        // after some markdown has been rendered into the info box, update
        // any links that highlight nodes or groups in the flow.
        RED.events.on( 'markdown:rendered', () => {
            setTimeout( () => {
                handleTextReferences()
                // enable any tasklist checkboxes
                $('.red-ui-panel').find('input[type=checkbox][disabled=""]').removeAttr(
                    'disabled'
                ).on('change', (e) => {
                    e.preventDefault()
                    RED.nodes.dirty(true) // this activates the deploy button
                    console.log( "ELEM", e )
                })
            },1000)
        })

        // once the flow has been loaded, check for inject nodes that have
        // a once-trigger. For each of them, set up a setTimeout so that
        // these nodes are triggered.
        var flowsLoadedCallback = () => {
            RED.events.off( 'flows:loaded', flowsLoadedCallback )
            setTimeout( () => {
                RED.nodes.eachNode( nde => {
                    if ( nde.type == "inject" && nde.once ) {
                        var ndeId = nde.id;
                        setTimeout( () => {
                            executeFlow(ndeId, {})
                        }, nde.onceDelay * 1000 )
                    }
                })
            }, 500)
        }
        RED.events.on('flows:loaded', flowsLoadedCallback);

        // simulate the heartbeat packet from server
        setInterval( () => {
            RED.comms.emit({ topic: 'hb', data: Date.now() })
        }, 15000)

        // on mobile, hide the sidebar and the palette at startup
        if ( (RED.utils.getBrowserInfo().mobile > 0) ||
             window.matchMedia('only screen and (max-width: 890px)').matches ) {

            setTimeout( function() {
                RED.menu.toggleSelected("menu-item-palette");
                RED.menu.toggleSelected("menu-item-sidebar");
            }, 1400);
        }

        RED.actions.add("core:click-selected-nodes-button", function () {
            const selectedNodes = RED.view.selection().nodes || [];
            // Triggers the button action of the selected nodes
            selectedNodes.forEach((node) => RED.view.clickNodeButton(node));
        });

        let customDropHandler = (event) => {
            /* for debugging purposes - inspect the original Event to discover the type:
             *   console>  window.ddEvent.originalEvent.dataTransfer.items[0].type
             */
            window.ddEvent = event

            let itemPtr = event.originalEvent.dataTransfer.items
            let itemCount = itemPtr.length

            let nodesToBeImported = []
            let waitingOnNode = 0;

            let file2base64Image = (file, cb) => {
                var reader = new FileReader();
                reader.onload = (function (fd) {
                    return function (e) {
                        cb(e.target.result);
                    };
                })(file);
                reader.readAsDataURL(file);
            }

            for( let idx = 0; idx < itemCount ; idx++ ) {
                let itm = itemPtr[idx]

                if ( ( itm.type == "text/uri-list" ||
                       itm.type == "text/x-moz-url" ) && itm.kind == "string" ) {
                    waitingOnNode++;

                    let yPos = 40 * waitingOnNode

                    itm.getAsString( (url) => {
                        let urlAndTitle = url.split("\n")

                        let data = {
                            "id": RED.nodes.id(),
                            "type": "Bookmark",
                            "name": urlAndTitle[1] || "Web Bookmark",
                            "info": urlAndTitle[0],
                            "sumPass": false,
                            "sumPassPrio": 0,
                            "sumPassNodeId": "",
                            "createdAt": new Date().toISOString(),
                            "updatedAt": new Date().toISOString(),
                            "x": 0,
                            "y": yPos,
                            "wires": [[ ]]
                        }

                        let nodeCopy = nodesToBeImported.filter(d => d.info.indexOf(urlAndTitle[0]) > -1)[0]

                        if ( !nodeCopy ) {
                            nodesToBeImported.push(data)
                        } else {
                            if (data.name != "Web Bookmark" && nodeCopy.name == "Web Bookmark") {
                                nodeCopy.name = data.name
                                nodeCopy.type = data.type
                            }
                            waitingOnNode--
                        }

                    })
                } else if ( itm.type.startsWith("image/") ) {
                    waitingOnNode++

                    let file = event.originalEvent.dataTransfer.files[idx]
                    let yPos = waitingOnNode * 40

                    file2base64Image(file, dataUrl => {
                        nodesToBeImported.push({
                            "id": RED.nodes.id(),
                            "type": "Image",
                            "name": file.name,
                            "info": `<img src="${dataUrl}"/>\n`,
                            "sumPass": false,
                            "sumPassPrio": 0,
                            "sumPassNodeId": "",
                            "createdAt": new Date().toISOString(),
                            "updatedAt": new Date().toISOString(),
                            "x": 0,
                            "y": yPos,
                            "wires": [[ ]]
                        })
                    })
                } else if ( itm.type == "text/markdown" ) {
                    waitingOnNode++

                    let file = event.originalEvent.dataTransfer.files[idx]
                    let yPos = waitingOnNode * 40

                    file.arrayBuffer().then( d => {
                        nodesToBeImported.push({
                            "id": RED.nodes.id(),
                            "type": "Text",
                            "name": file.name,
                            "info": new TextDecoder().decode(d),
                            "sumPass": false,
                            "sumPassPrio": 0,
                            "sumPassNodeId": "",
                            "createdAt": new Date().toISOString(),
                            "updatedAt": new Date().toISOString(),
                            "x": 0,
                            "y": yPos,
                            "wires": [[ ]]
                        })
                    }).catch( ex => { console.log(ex) })
                } else if ( (itm.type == "text/xml" ||
                             itm.type == "text/css" ||
                             itm.type == "application/x-javascript" ||
                             itm.type == "text/plain" ||
                             itm.type == "text/html" ||
                             itm.type == "text/vcard" ||
                             itm.type == "text/x-python-script" ||
                             itm.type == "application/x-yaml"
                           ) && (
                              event.originalEvent.dataTransfer.files && event.originalEvent.dataTransfer.files[idx]
                           )) {
                    /*
                     * Why is there a checking for existence of file data?
                     *
                     * Because text/plain is supported here BUT it's assumed that there is a
                     * corresponding file, ensure that there is, else ignore text/plain.
                     * text/plain also occurs without having a file attached.
                     */
                    waitingOnNode++

                    let file = event.originalEvent.dataTransfer.files[idx]
                    let yPos = waitingOnNode * 40

                    let mapMineTypeToFormat = (minetype) => {
                        let type = minetype.split("/")[1].replace("x-","")

                        return {
                            "vcard":         "text",
                            "plain":         "text",
                            "python-script": "python",
                        }[type] || type;
                    }

                    file.arrayBuffer().then( d => {
                        nodesToBeImported.push({
                            "id": RED.nodes.id(),
                            "type": "PkgFile",
                            "name": file.name,
                            "filename": file.name,
                            "dirname": "",
                            "format": mapMineTypeToFormat(itm.type),
                            "syntax": "mustache",
                            "template": new TextDecoder().decode(d),
                            "output": "str",
                            "y": yPos,
                            "x": 0,
                            "wires": [[]]
                        })
                    }).catch( ex => { console.log(ex) })
                }

            }

            let checkIfAllIsThere = () => {
                if (waitingOnNode > 0 && nodesToBeImported.length == waitingOnNode) {
                    setTimeout( () => {
                        try {
                            RED.view.importNodes(nodesToBeImported)
                        } catch ( ex ) { /*keep quiet*/ }
                    },400);
                } else {
                    setTimeout( checkIfAllIsThere, 400 )
                }
            }

            if ( waitingOnNode > 0 ) {
                setTimeout( checkIfAllIsThere, 200 )
                setTimeout( () => { nodesToBeImported.length = waitingOnNode }, 4000 )
            }
        }

        /*
         * Because this happens before the workspace is setup, we set the drop listen
         * when the target becomes available.
         */
        let defineCustomDropHandler = () => {
            if ( $('#red-ui-drop-target').length > 0 ) {
                $('#red-ui-drop-target').on("drop", customDropHandler)
            } else {
                setTimeout( defineCustomDropHandler, 300 )
            }
        }
        setTimeout( defineCustomDropHandler, 300 )

        // handle a generate paste in the browser window. But this only
        // works outside of the workspace area. But this is only a prototype.
        $(window).on('paste', (event) => {
            try {
                window.pasteEvent = event

                // there too many edge cases so explicitly on those elements that are
                // safe are selected here.
                if (!event.target || !(event.target.id == "red-ui-header" ||
                                       event.target.id == "red-ui-workspace-chart" )) {
                    return
                }

                let pasteText = event.originalEvent.clipboardData.getData('text')
                let data = JSON.parse(pasteText)

                if (Array.isArray(data)) {
                    try {
                        RED.view.importNodes(data, {
                            generateIds: false,
                            addFlow: false,
                            touchImport: false,
                            generateDefaultNames: false
                        })
                    } catch (ex) { RED.notify( `Error: ${ex.message}`, { type: "warning"}) }
                }
            } catch (ex) { RED.notify(`Error: ${ex.message}`, { type: "warning" }) }
        })

        console.log( "DEADRED initialised" )
    }

    return {
        executeFlow: executeFlow,
        reloadFlows: reloadFlows,
        init: init
    };
})();
