@echo OFF
poetry run flask --app "tsh:create_app('testing.cfg')" run
pause
