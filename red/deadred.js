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

    function clearStatusForNode(nde) {
        emitStatusForNode(nde,{})
    }

    function emitStatusForNode(nde,status) {
        RED.comms.emit([{ "topic":"status/" + nde.id, "data": status }])
    }

    function nodeTypeNotSupported(nde) {
        RED.notify(
            "Execution of type: " + nde.type + "("+nde.id+") not supported",
            "warning"
        );
    }

    function isNodeDebugCounter(nde) {
        return (
            nde.type == "debug" && nde.tostatus && (
                nde.statusType == "counter" || nde.statusType == "auto")
        )
    }

    function executeNode(nde, msg) {
        // d ==> disabled
        if ( stopExecution || nde.d ) { return; }

        // clone the message, handle exceptions with shallower clone
        try {
            msg = structuredClone(msg)
        } catch ( ex ) {
            msg = JSON.parse( JSON.stringify(msg))
        }

        // don't overwrite the counter
        if ( !isNodeDebugCounter(nde) ) {
            emitStatusForNode(nde, {
                "text":"msg received",
                "fill":"grey",
                "shape":"ring"
            })

            setTimeout( () => { clearStatusForNode(nde) }, 1500);
        }

        switch ( nde.type ) {
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

            case "change":
                nde.rules.forEach( rle => {
                    if ( rle.t == "set" ) {
                        if ( rle.pt == "msg" && rle.tot == "str" ) {
                            msg[rle.p] = rle.to
                        }
                        if ( rle.pt == "msg" && rle.tot == "json" ) {
                            msg[rle.p] = JSON.parse(rle.to)
                        }
                    }

                    if ( rle.t == "delete" && rle.pt == "msg" ) {
                        delete msg[rle.p];
                    }
                })

                passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg);
                return

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

            case "debug":
                if ( !nde.active ) { return }

                let donesomething = false;

                if ( nde.console ) {
                    console.log( "Debug Node", msg)
                    donesomething = true
                }

                if ( nde.tosidebar ) {
                    RED.comms.emit([{
                        "topic":"debug",
                        "data":{
                            "id":nde.id,
                            "z":nde.z,
                            "path":nde.z,
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

                    emitStatusForNode(nde, {
                        "text": txt,
                        "fill":"blue",
                        "shape":"ring"
                    })
                    donesomething = true
                }

                if ( donesomething ) return

            case "ClientCode":
                let data = [
                    {
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
                    }
                ]

                RED.comms.emit(data)
                return;

            case "link out":

                if ( nde.mode == "link" ) {
                    nde.links.forEach( ndeid => {
                        let nde = RED.nodes.node(ndeid);
                        captureExceptionExecuteNode(nde, msg)
                    })
                    return
                }

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
                                msg[prp.p] = Buffer.from(data);
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
            console.error( "captureExceptionExecuteNode: Node was null")
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
            captureExceptionExecuteNode(nde, msg)
        })
    }

    // called once the deploy restart flow is called.
    function reloadFlows() {
        stopExecution = true;

        setTimeout( () => {
            stopExecution = false
            executionState = {};
            RED.nodes.eachNode( (nde) => { clearStatusForNode(nde) });
        }, 2000);
    }

    // redirect those requests that demonstrate certain functionality
    // to the deadred server.
    let deadredRedirectablesAjax = [
        "FlowHubDiff",
        "FlowHubPush",
        "FlowCompareCfg",
        "NodeFactorySidebarCfg"
    ];

    // we assume that RED is defined.
    $.ajaxPrefilter(function( options, originalOptions, jqXHR ) {
        let mth = undefined;

        // patial functionality provided by the deadred backend
        if ( deadredRedirectablesAjax.indexOf( options.url ) > -1 ) {
            options.url = RED.settings.get("dynamicServer", "") + options.url
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
            }
        }
    });

    function init() {
        console.log( "DEADRED initialised" )
    }

    return {
        executeFlow: executeFlow,
        reloadFlows: reloadFlows,
        init: init
    };
})();
