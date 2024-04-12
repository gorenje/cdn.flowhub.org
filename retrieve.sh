#!/bin/bash
#
# retrieve.sh
#
# Author: Gerrit Riessen, gerrit@openmindmap.org
# Copyright (C) 2023 Gerrit Riessen
# This code is licensed under the GNU Public License.
#
# $Id$
#

# This script will retrieve certain configuration files from an existing
# node red instance and copy these here. It retrieves:
#
#   - icons configuration and all icons
#   - nodes configuration .json, .html and locales
#   - plugin configuration .json, .html and locales
#   - locales in the locales directory
#
# other things will need to be updated manually.

### TODO change the following.
NODERED_URL=http://node-red-instance-host:1880/httpAdminRoot
NODERED_URL=http://strobes:1880/cfg

### TODO remove this also
#echo "Edit retrieve.sh before use"
#exit

CBSTMP=$(date +%s)
PyTHON=/usr/bin/python3

LoCaLeS="en-US en-GB en de-DE de fr ja ko pt-BR ru zh-CN zh-TW"

echo "==> icons.json"
curl -s "${NODERED_URL}/icons?_=${CBSTMP}" -H 'Accept: application/json' | $PyTHON .py/json_pretty.py > icons.json

for lnk in `cat icons.json | $PyTHON .py/icon_urls.py` ; do
    echo "==> ${lnk}"
    mkdir -p `dirname ${lnk}`
    curl -s ${NODERED_URL}/${lnk} > ${lnk}
done

for typ in nodes plugins ; do

    for lng in ${LoCaLeS} ; do
        echo "==> ${typ}/messages/${lng}"
        curl -s "${NODERED_URL}/${typ}/messages?lng=${lng}&_=${CBSTMP}" | $PyTHON .py/json_pretty.py > ${typ}/messages.${lng}
    done
    cp ${typ}/messages.en-US ${typ}/messages

    echo "==> ${typ}/nodes.json"
    curl -s "${NODERED_URL}/${typ}?_=${CBSTMP}" -H 'Accept: application/json' | $PyTHON .py/json_pretty.py > ${typ}/${typ}.json

    echo "==> ${typ}/nodes.html"
    curl -s "${NODERED_URL}/${typ}?_=${CBSTMP}" -H 'Accept: text/html' > ${typ}/${typ}.html

done

for lcls in editor infotips node-red jsonata ; do
    for lng in ${LoCaLeS} ; do
        echo "==> locales/${lcls}/${lng}"
        curl -s "${NODERED_URL}/locales/${lcls}?lng=${lng}" | $PyTHON .py/json_pretty.py > locales/${lcls}.${lng}
    done
done

for lnk in blockly-contrib/npm/blockly/blockly_compressed.js \
              blockly-contrib/npm/blockly/msg/en.js \
              blockly-contrib/npm/blockly/blocks_compressed.js \
              blockly-contrib/npm/blockly/javascript_compressed.js \
              blockly-contrib/npm/@blockly___SEPARATOR___plugin-workspace-search/dist/index.js \
              blockly-contrib/npm/@blockly___SEPARATOR___zoom-to-fit/dist/index.js \
              blockly-contrib/npm/@blockly___SEPARATOR___workspace-backpack/dist/index.js \
              blockly-contrib/npm/@blockly___SEPARATOR___toolbox-search/dist/index.js \
              blockly-contrib/npm/@blockly___SEPARATOR___workspace-minimap/dist/index.js \
              blockly-contrib/npm/node-red-contrib-blockly/lib/nodered/nodeRedBlocksCodeGen.js \
              blockly-contrib/npm/node-red-contrib-blockly/lib/nodered/nodeRedBlocksDefs.js \
              blockly-contrib/npm/node-red-contrib-blockly/messages/en.js \
              blockly-contrib/npm/node-red-contrib-blockly/lib/json/objectBlocksCodeGen.js \
              blockly-contrib/npm/node-red-contrib-blockly/lib/json/objectBlocksDefs.js \
              blockly-contrib/npm/node-red-contrib-blockly/lib/buffer/bufferBlocksCodeGen.js \
              blockly-contrib/npm/node-red-contrib-blockly/lib/buffer/bufferBlocksDefs.js \
              blockly-contrib/npm/@blockly___SEPARATOR___field-date/dist/index.js \
              blockly-contrib/npm/node-red-contrib-blockly/lib/datetime/dateTimeBlocksCodeGen.js \
              blockly-contrib/npm/node-red-contrib-blockly/lib/datetime/dateTimeBlocksDefs.js \
              blockly-contrib/npm/node-red-contrib-blockly/lib/timer/timerBlocksCodeGen.js \
              blockly-contrib/npm/node-red-contrib-blockly/lib/timer/timerBlocksDefs.js \
              blockly-contrib/npm/node-red-contrib-blockly/lib/extra/extraBlocksCodeGen.js \
              blockly-contrib/npm/node-red-contrib-blockly/lib/extra/extraBlocksDefs.js \
              blockly-contrib/npm/node-red-contrib-blockly/lib/nodered/toolbox.xml \
              blockly-contrib/npm/node-red-contrib-blockly/lib/json/toolbox.xml \
              blockly-contrib/npm/node-red-contrib-blockly/lib/buffer/toolbox.xml \
              blockly-contrib/npm/node-red-contrib-blockly/lib/datetime/toolbox.xml \
              blockly-contrib/npm/node-red-contrib-blockly/lib/timer/toolbox.xml \
              blockly-contrib/npm/node-red-contrib-blockly/lib/extra/toolbox.xml \
              blockly-contrib/npm/node-red-contrib-blockly/lib/basic/toolbox.xml \
              blockly-contrib/npm/@blockly___SEPARATOR___theme-dark/src/index.js \
              blockly-contrib/npm/@blockly___SEPARATOR___theme-deuteranopia/src/index.js \
              blockly-contrib/npm/@blockly___SEPARATOR___theme-highcontrast/src/index.js \
              blockly-contrib/npm/@blockly___SEPARATOR___theme-modern/src/index.js \
              blockly-contrib/npm/@blockly___SEPARATOR___theme-tritanopia/src/index.js \
              FlowHubLib/jslib/diff.min.js \
              FlowCompare/jslib/flowviewer.min.js \
              FlowCompare/jslib/diff.min.js \
           ; do

    echo "==> ${lnk}"
    mkdir -p `dirname ${lnk}`
    curl -s ${NODERED_URL}/${lnk} > ${lnk}
done
