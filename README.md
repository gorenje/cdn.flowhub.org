# Serverless Node-RED instance

This repository contains a minimal viable Node-RED instance. The intention is to give folks the chance to try out the Node-RED client (i.e. the editor) without having to install a server. The editor can be viewed at [cdn.flowhub.org](https://cdn.flowhub.org) - nothing can be broken, everything is static --> reload to reset the flow.

An initial idea was to use [Stackblitz](https://stackblitz.com/edit/node-djgejy?file=index.js&initialPath=/?fhid=aaab9308f8fbb2c5) for hosting an in-browser complete version of Node-RED, i.e. with server but that did not [work out](https://discourse.nodered.org/t/in-browser-node-red-a-follow-up-using-stackblitz/83639). Instead I decided to create this repository with a basic Node-RED client missing its server.

The secret sauce is though: I made many small changes to the [red.js](blob/main/red/red.cdn.js) to support a dynamic server for certain actions, i.e., loading the initial flow data.

Node-RED version used is 3.1.3 with dashboard nodes and some other nodes pre-installed. Loading of other node packages is not supported but deployment is supported ... but nothing changes.

A dynamic server definition is defined [by this flow](https://flowhub.org/f/15cc9fb0e94d56cd) - its responsible for providing a websocket endpoint, a POST endpoint and for providing an initial flow to be shown. For example, the backend flow can be also viewed in the [Node-RED client](https://cdn.flowhub.org/?fhid=15cc9fb0e94d56cd).

Purpose of all this is to provide a "Node-RED feel" for folks interested in using Node-RED but who do not have the ability to install it somewhere. And since creating a serverful Node-RED instance for others to use would be a open invitation to all sorts of illegal activities, hence this static but dynamic-feeling Node-RED instance.
