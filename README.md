# Serverless Node-RED instance

This repository contains a minimal viable Node-RED instance. The intention is to give folks the chance to try out the Node-RED client (i.e. the editor) without having to install a server. The editor can be viewed at [cdn.flowhub.org](https://cdn.flowhub.org) - nothing can be broken, everything is static --> reload to reset the flow.

An initial idea was to use [Stackblitz](https://stackblitz.com/edit/node-djgejy?file=index.js&initialPath=/?fhid=aaab9308f8fbb2c5) for hosting an in-browser complete version of Node-RED, i.e. with server but that did not [work out](https://discourse.nodered.org/t/in-browser-node-red-a-follow-up-using-stackblitz/83639). Instead I decided to create this repository with a basic Node-RED client missing its server.

The secret sauce is though: I made many small changes to the [red.js](red/red.cdn.js) to support a dynamic server for certain actions, i.e., loading the initial flow data.

Node-RED version used is 3.1.3 with dashboard nodes and some other nodes pre-installed. Loading of other node packages is not supported but deployment is supported ... but nothing changes.

A dynamic server definition is defined [by this flow](https://flowhub.org/f/15cc9fb0e94d56cd) - its responsible for providing a websocket endpoint, a POST endpoint and for providing an initial flow to be shown. For example, the backend flow can be also viewed in the [Node-RED client](https://cdn.flowhub.org/?fhid=15cc9fb0e94d56cd).

Purpose of all this is to provide a "Node-RED feel" for folks interested in using Node-RED but who do not have the ability to install it somewhere. And since creating a serverful Node-RED instance for others to use would be a open invitation to all sorts of illegal activities, hence this static but dynamic-feeling Node-RED instance.

## Gist support

If you want to load a Gist (i.e., from [flows.nodered.org](https://flows.nodered.org/search?type=flow)) as initial flow, then add the [gist=](https://cdn.flowhub.org/?t=0&gist=joepavitt/ec39fe4e3187a7c41153488d4e0abbf3) parameter. The gist can be found by clicking on the *view on github* link.

The gist can either be `user/gistid` or just `gistid` - it seems that the user name does not scope the gistid, it appears to be globally unique.

Gists must have a file called `flow.json` at the top level else this won't work.

## Import/Export of Flows

Importing the textual representation of flows is possible and works well. Note though that it is likely that flows will contain unknown nodes (shown in dashed red outlines).

Since this is an static instance, there is no possiblility to dynamically load nodes. You can clone the repo and add to the static files. [retrieve.sh](retrieve.sh) is a script that does some parts of the updating of existing static content from a live Node-RED instance.

## Running locally

To run this locally for testing *(this assumes python3 and make have been installed.)*:

```
make run-local
```

Node-RED will start will retrieve and initial [flow](https://flowhub.org/f/67a6db53dc49ae4c) from FlowHub.org. All communication with the dynamic server will continue.
