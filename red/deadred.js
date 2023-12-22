//
// This makes the assumption that RED is defined.
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
            nde.type == "debug" && nde.tostatus && (nde.statusType == "counter")
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
                if ( nde.pauseType == "delay" ) {
                }
                if ( nde.pauseType == "random" ) {
                }

                // TODO: make this work
                setTimeout( () => {
                    passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg)
                }, 1000);

                break;

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
                break;

            case "join":
                if ( nde.mode == "custom" && nde.build == "array" &&
                     nde.propertyType == "msg") {

                    executionState[nde.id] = executionState[nde.id] || []
                    executionState[nde.id].push( msg[nde.property] )

                    if ( executionState[nde.id].length == parseInt(nde.count) ) {
                        msg.payload = [...executionState[nde.id]];
                        delete executionState[nde.id]
                        passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg);
                    }
                } else {
                    nodeTypeNotSupported(nde)
                }
                break

            case "debug":
                if ( nde.console ) {
                    RED.comms.emit([{
                        "topic":"debug",
                        "data":{
                            "id":nde.id,
                            "z":nde.z,
                            "path":nde.z,
                            "name":nde._def.label.call(nde),
                            "topic":msg.topic,
                            "property":"payload",
                            "msg":JSON.stringify(msg),
                            "format":"Object"
                        }}])
                }

                if( isNodeDebugCounter(nde) ) {
                    executionState[nde.id] = executionState[nde.id] || {
                        cnt: 0
                    }
                    executionState[nde.id]["cnt"] += 1

                    emitStatusForNode(nde, {
                        "text": executionState[nde.id]["cnt"],
                        "fill":"blue",
                        "shape":"ring"
                    })
                }
                break;

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
                break;


            case "inject":
            // TODO: here fill the msg object with data connect to the
            // TODO: inject node.
            case "junction":
                passMsgToLinks(RED.nodes.getNodeLinks( nde ), msg);
                break;
            default:
                nodeTypeNotSupported(nde)
        }

    }

    // this is called by inject when its button is pressed...
    function executeFlow(nodeid, msg) {
        let nde = RED.nodes.node(nodeid)
        if ( nde.type == "inject" ) {
            stopExecution = false;
            executionState = {};
            msg._msgid = RED.nodes.id()
            executeNode(nde, msg)
        }
    }

    function passMsgToLinks(links, msg) {
        links.forEach( lnk => {
            let nde = (
                RED.nodes.node(lnk.target.id) ||
                RED.nodes.junction(lnk.target.id)
            )

            executeNode(nde, msg)
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
