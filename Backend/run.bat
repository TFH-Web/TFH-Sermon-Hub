@echo OFF
set TENANT_ID=bbd486c4-7835-4ba2-9df4-907a25b4b46c
set CLIENT_ID=f8108595-ffa8-4c94-957f-b92b006da038
poetry run flask --app "tsh:create_app('testing.cfg')" run
pause