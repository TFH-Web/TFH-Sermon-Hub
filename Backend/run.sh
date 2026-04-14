#!/usr/bin/env bash

poetry run flask --app "tsh:create_app('testing.cfg')" run
