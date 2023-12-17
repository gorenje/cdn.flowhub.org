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

### TODO remove this also
echo "Edit retrieve.sh before use"
exit

CBSTMP=$(date +%s)
PyTHON=/usr/bin/python3

echo "==> icons.json"
curl -s "${NODERED_URL}/icons?_=${CBSTMP}" -H 'Accept: application/json' | $PyTHON .py/json_pretty.py > icons.json

for lnk in `cat icons.json | $PyTHON .py/icon_urls.py` ; do
    echo "==> ${lnk}"
    mkdir -p `dirname ${lnk}`
    curl -s ${NODERED_URL}/${lnk} > ${lnk}
done

for typ in nodes plugins ; do

    echo "==> ${typ}/messages"
    curl -s "${NODERED_URL}/${typ}/messages?lng=en-US&_=${CBSTMP}" | $PyTHON .py/json_pretty.py > ${typ}/messages

    echo "==> ${typ}/nodes.json"
    curl -s "${NODERED_URL}/${typ}?_=${CBSTMP}" -H 'Accept: application/json' | $PyTHON .py/json_pretty.py > ${typ}/${typ}.json

    echo "==> ${typ}/nodes.html"
    curl -s "${NODERED_URL}/${typ}?_=${CBSTMP}" -H 'Accept: text/html' > ${typ}/${typ}.html

done

for lcls in editor infotips node-red jsonata ; do
    echo "==> locales/${lcls}"
    curl -s "${NODERED_URL}/locales/${lcls}?lng=en-US" | $PyTHON .py/json_pretty.py > locales/${lcls}
done
