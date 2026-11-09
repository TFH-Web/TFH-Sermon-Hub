#!/bin/sh
# Install as a root-owned Certbot deploy hook after the production review.
set -eu
/usr/sbin/nginx -t
/usr/bin/systemctl reload nginx
