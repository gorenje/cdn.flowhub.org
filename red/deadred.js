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

    function nodeTypeNotSupported(nde) {
        RED.notify(
            "Execution of type: " + nde.type + " ("+nde.id+") not supported",
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

    function executeNode(nde, msg) {
        // d ==> disabled
        if ( stopExecution || nde.d ) { return; }

        // clone the message, handle exceptions with shallower clone
        if ( typeof structuredClone != "undefined" ) { //looking at your Opera...
            try {
                msg = structuredClone(msg)
            } catch ( ex ) {
                msg = JSON.parse( JSON.stringify(msg))
            }
        } else {
            msg = JSON.parse( JSON.stringify(msg))
        }

        // message tracing can be deactivated using the __notrace property
        // on the msg object.
        if ( !msg.__notrace ) {
            // don't overwrite the counter
            if ( !isNodeDebugCounter(nde) ) {
                emitStatusForNode(nde.id, {
                    "text": "msg " + (nde.type == "inject" ? "generaed" : "received"),
                    "fill": "grey",
                    "shape":"ring"
                })

                var ndeid = nde.id
                setTimeout( () => { clearStatusForNode(ndeid) }, 1500);
            }
        }

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
            case "ClientCode":
                RED.comms.emit([{
                    "topic":"introspect:client-code-perform",
                    "data":{
                        "msg":"execfunc",
                        "payload":msg.payload,
                        "topic":msg.topic,
                        "func": nde.clientcode,
                        "nodeid": nde.id,
                        "_msg": { ...msg },
                        "format":"string["+nde.clientcode.length+"]"
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
                            msg[rle.p] = jsonata(rle.to).evaluate({msg:msg})
                        }
                        if ( rle.pt == "msg" && rle.tot == "msg" ) {
                            msg[rle.p] = NodeRedBackendCode.getObjectProperty(
                                msg, rle.to
                            )
                        }
                    }

                    if ( rle.t == "delete" && rle.pt == "msg" ) {
                        delete msg[rle.p];
                    }
                })

                passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg);
                return

            case "debug":
                if ( !nde.active ) { return }

                let donesomething = false;

                if ( nde.console ) {
                    console.log( "Debug Node", msg)
                    donesomething = true
                }

                if ( nde.tosidebar ) {
                    // TODO: debugs don't work in subflows since the
                    // TODO: path setting is wrong
                    RED.comms.emit([{
                        "topic":"debug",
                        "data":{
                            "id": nde.id,
                            "z": nde.z,
                            "path": nde.z,
                            "name":nde._def.label.call(nde),
                            "topic":msg.topic,
                            "property":"",
                            "msg":JSON.stringify(msg),
                            "format":"Object"
                        }}])
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
                        dataType: typeFromRet(nde.ret)
                    }).done( data => {
                        if ( nde.ret == "txt" ) {
                            msg.payload = data.toString("utf8")
                        } else if ( nde.ret == "bin" ) {
                            msg.payload = new ArrayBuffer(data)
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
                    let val = NodeRedBackendCode.getObjectProperty(
                        msg,nde.property
                    )

                    let correctness = nde.rules.map( rle => {
                        let tst = NodeRedBackendCode.switchOperators[rle.t] || (() => {return false})

                        try {
                            return tst(val,rle.v,rle.v2)
                        } catch (ex) {
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
                }

                break

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
                            break;

                        case "str":
                            msg[prp.p] = prp.v
                            break;

                        case "date":
                            msg[prp.p] = Date.now()
                            break;

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

                nde.props.forEach( prp => {
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
            RED.notify( "Error executing: " + nde.id, "error");
            console.error( "Error for node", [nde, ex, msg])
        }
    }

    // this is called by inject when its button is pressed...
    function executeFlow(nodeid, msg) {
        let nde = RED.nodes.node(nodeid)
        if ( nde.type == "inject" ) {
            msg._msgid = RED.nodes.id()
            captureExceptionExecuteNode(nde, msg)
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
            captureExceptionExecuteNode(nde, msg)
        })
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
        "FlowHubDiff",
        "FlowHubPush",
        "NodeFactorySidebarCfg"
    ];

    // we assume that RED is defined.
    $.ajaxPrefilter(function( options, originalOptions, jqXHR ) {
        let mth = undefined;

        // patial functionality provided by the deadred backend
        if ( deadredRedirectablesAjax.indexOf( options.url ) > -1 ) {
            options.url = RED.settings.get("dynamicServer", "") + options.url
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
                "changes": compareFlows({ payload: lclnodes,
                                          new_flowdata: data.flowdata })
            })

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
            } else {
                // this is a node.send(...) call
                passMsgToLinks(
                    RED.nodes.getNodeLinks( RED.nodes.node(mth[1]) ),
                    JSON.parse(options.data)
                );
                jqXHR.abort();
            }
        }

        // if an inject button does get pressed, simulate a flow execution
        // but with only specific nodes being supported.
        mth = options.url.match(/^inject\/([a-z0-9]{16})/i)
        if ( mth ) {
            jqXHR.abort();
            options.success({})

            DEADRED.executeFlow(mth[1], {
                ...JSON.parse(options.data),
                payload: Date.now()
            })
        }

        // a click on the deploy button, an update of the flow. Pass
        // through but handle a reload and stop the flows.
        if ( options.url == (RED.settings.get("dynamicServer", "") + "flows")
          && options.type == "POST") {
            if ( options.headers["Node-RED-Deployment-Type"] == "reload" ){
                reloadFlows()
            } else {
                RED.settings.setLocal( "flowdata", options.data)
            }
        }
    });

    //
    // Used to highlight the links in markdown text
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
            RED.nodes.group(grpId).nodes.forEach( n => {
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

    function init() {
        RED.events.on( 'markdown:rendered', () => {
            setTimeout( () => {
                handleTextReferences()
            },1000)
        })

        console.log( "DEADRED initialised" )
    }

    return {
        executeFlow: executeFlow,
        reloadFlows: reloadFlows,
        init: init
    };
})();
