export default {
    steps: [
        {
            title: "Create your first flow",
            fullscreen: true,
            direction: "inset",
            width: 400,
            description: 'This tutorial will guide you through creating your first flow',
            nextButton: 'start'
        },
        {
            element: "#red-ui-workspace .red-ui-tab-button.red-ui-tabs-add",
            description: 'To add a new tab, click the <i class="fa fa-plus"></i> button',
            wait: {
                type: "dom-event",
                event: "click",
                element: "#red-ui-workspace .red-ui-tab-button.red-ui-tabs-add a"
            },
        },
        {
            element: '.red-ui-palette-node[data-palette-type="inject"]',
            direction: 'right',
            description: 'The palette lists all of the nodes available to use. Drag a new Inject node into the workspace.',
            fallback: 'inset-bottom-right',
            wait: {
                type: "nr-event",
                event: "nodes:add",
                filter: function(event) {
                    if (event.type === "inject") {
                        this.injectNode = event;
                        return true;
                    }
                    return false
                }
            },
            complete: function() {
                $('.red-ui-palette-node[data-palette-type="inject"]').css("z-index","auto");
            }
        },
        {
            element: '.red-ui-palette-node[data-palette-type="debug"]',
            direction: 'right',
            description: 'Next, drag a new Debug node into the workspace.',
            fallback: 'inset-bottom-right',
            wait: {
                type: "nr-event",
                event: "nodes:add",
                filter: function(event) {
                    if (event.type === "debug") {
                        this.debugNode = event;
                        return true;
                    }
                    return false
                }
            },
            complete: function() {
                $('.red-ui-palette-node[data-palette-type="debug"]').css("z-index","auto");
            },
        },
        {
            element: function() { return $("#"+this.injectNode.id+" .red-ui-flow-port") },
            description: 'Add a wire from the output of the Inject node to the input of the Debug node',
            fallback: 'inset-bottom-right',
            wait: {
                type: "nr-event",
                event: "links:add",
                filter: function(event) {
                    return  event.source.id === this.injectNode.id && event.target.id === this.debugNode.id;
                }
            },
        },
        {
            element: "#red-ui-header-button-deploy",
            description: 'Deploy your changes so the flow is active in the runtime',
            width: 200,
            wait: {
                type: "dom-event",
                event: "click"
            },
        }
    ]
}
