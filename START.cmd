@echo off
REM ====================================================
REM  CAK AI Ecosystem — double-click buat nyalain semua
REM ====================================================
title CAK AI - Start All
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-all.ps1"
echo.
echo Tekan tombol apa aja buat nutup window ini...
pause >nul
