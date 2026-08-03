# 🛡️ PANDUAN LENGKAP: HOW TO EDIT, TEST, & DEPLOY (SAFE WORKFLOW)
> **Panduan Resmi Pengoperasian, Pengeditan Kode, & Deployment Ekosistem CAKETING**  
> *Mencegah Terjadinya Force Push, Data Overwrite, dan Database WipeOut di Masa Depan.*

---

## 📋 DAFTAR ISI
1. [Penyebab Masalah Lalu (Kenapa Dulu Data/Repo Pernah Terhapus?)](#1-penyebab-masalah-lalu-kenapa-dulu-datarepo-pernah-terhapus)
2. [Peta Folder & Status Repo (Mana yang Live vs Stale?)](#2-peta-folder--status-repo-mana-yang-live-vs-stale)
3. [SOP Pengeditan Kode & Pengujian (How-To Edit)](#3-sop-pengeditan-kode--pengujian-how-to-edit)
4. [SOP Deployment yang Aman (How-To Deploy)](#4-sop-deployment-yang-aman-how-to-deploy)
5. [Perlindungan Database Supabase (Database Safety Rules)](#5-perlindungan-database-supabase-database-safety-rules)
6. [Konfigurasi Otomatis untuk AI Agent (Claude Code / Cursor / Antigravity)](#6-konfigurasi-otomatis-untuk-ai-agent-claude-code--cursor--antigravity)

---

## 1. PENYEBAB MASALAH LALU (KENAPA DULU DATA/REPO PERNAH TERHAPUS?)

Pada tanggal 27 Juli lalu, sempat terjadi insiden di mana repositori GitHub terurai dari **332 file menjadi 113 file** (sebagian besar fitur baru & data terhapus). 

### 🔍 Penyebab Utama:
Ada **2 folder lokal terpisah** di komputer kamu yang terhubung ke repositori GitHub yang **SAMA (`https://github.com/haidarga/CAK-UNIVERSE.git`)**:

1. `F:\KERJAAN\CAK AI\caketing` 🟢 **(LENGKAP & AKTIF)** — Berisi seluruh kode terbaru, 332+ file, skrip generasi naskah, Triage Queue, Knowledge Manager, dan integrasi Vercel terbaru.
2. `F:\KERJAAN\CAK AI\cakai-ecosystem` 🔴 **(STALE & KUNO)** — Folder klon lama yang sudah tidak pernah di-update (versi commit lama).

Ketika Claude Code / CLI / Developer secara tidak sengaja membuka folder `cakai-ecosystem` lalu menjalankan `git push --force origin main`, repositori GitHub **dipaksa kembali ke masa lalu (menimpa kode baru dengan kode lama)**, yang menyebabkan Vercel mempublikasikan versi lama dan tabel-tabel database baru kehilangan referensinya!

---

## 2. PETA FOLDER & STATUS REPO (MANA YANG LIVE VS STALE?)

Berikut adalah pemetaan wajib yang harus dipatuhi oleh **kamu maupun AI Agent (Claude Code / Cursor / Antigravity)**:

| Path Folder di Komputer | Status | Fungsi & Aturan |
|---|---|---|
| **`F:\KERJAAN\CAK AI\caketing`** | 🟢 **ACTIVE / LIVE** | **SATU-SATUNYA FOLDER UNTUK PENGEMBANGAN & PUSH.**<br>• Repo Git: `https://github.com/haidarga/CAK-UNIVERSE.git`<br>• Vercel Deployment: `cakaiuniverseindonesia.vercel.app`<br>• Production Supabase: `https://hrsdzstbizbkrniczizo.supabase.co` |
| **`F:\tmp\cak-v3`** | 🟢 **ACTIVE STUDIO** | **CAK Video Studio v3 (Pabrik Video AI).**<br>• Tempat produksi visual, video generation (r2v), voice cloning, dan auto-editing. |
| **`F:\KERJAAN\CAK AI\cakai-ecosystem`** | 🔴 **STALE / DEAD** | **DILARANG DIBUKA, DIEDIT, ATAU DI-PUSH!**<br>• Folder ini adalah klon kuno. Jangan pernah menjalankan `git push` dari folder ini. |

---

## 3. SOP PENGEDITAN KODE & PENGUJIAN (HOW-TO EDIT)

### 📌 Langkah 1: Pastikan Kamu Berada di Folder yang Benar
Sebelum mengetik perintah apapun di terminal atau menyuruh Claude Code, jalankan perintah ini untuk memastikan posisi folder:

```powershell
# Cek lokasi folder aktif
pwd
```
> **Output yang Benar:** `F:\KERJAAN\CAK AI\caketing`

### 📌 Langkah 2: Cek Git Remote & Branch
Pastikan git remote mengarah ke `CAK-UNIVERSE`:

```powershell
git remote -v
```
> **Output yang Benar:** `origin https://github.com/haidarga/CAK-UNIVERSE.git`

### 📌 Langkah 3: Lakukan Perubahan Kode (Edit)
Lakukan perubahan pada komponen, API route, atau logika agent di dalam `src/`.

### 📌 Langkah 4: Jalankan TDD (Unit Testing)
Sebelum melakukan commit, **WAJIB** mengeksekusi suite pengujian Vitest untuk memastikan tidak ada fitur yang patah:

```powershell
npx vitest run tests/
```
> **Syarat:** Seluruh **129+ unit tests** harus berwarna **HIJAU / PASS**.

### 📌 Langkah 5: Jalankan Next.js Build Verification
Uji apakah aplikasi berhasil dikompilasi secara lokal tanpa error tipe TypeScript:

```powershell
npm run build
```
> **Syarat:** Output harus menunjukkan `✓ Compiled successfully` tanpa ada error kompilasi.

---

## 4. SOP DEPLOYMENT YANG AMAN (HOW-TO DEPLOY)

Setelah proses pengeditan, pengujian (*vitest*), dan verifikasi kompilasi (*npm run build*) berhasil 100%, ikuti alur deployment resmi berikut:

### 📥 1. Cek File yang Diubah
```powershell
git status
```

### ➕ 2. Stage File yang Akan Di-commit
```powershell
# Hanya masukkan file yang spesifik diubah
git add src/lib/llm.ts src/components/cakgpt/KnowledgeManager.tsx
# ATAU masukkan seluruh perubahan yang sudah diverifikasi
git add .
```

### 📝 3. Buat Commit Message yang Jelas
Gunakan format conventional commit:
```powershell
git commit -m "feat(knowledge): add multi-select batch delete and inline edit modal"
```

### 🚀 4. Push ke Production (BEBAS BAHAYA)
```powershell
git push origin main
```

> ⚠️ **ATURAN EMAS GIT:**  
> **JANGAN PERNAH MENGGUNAKAN `git push --force` ATAU `git push -f`!**  
> Menggunakan `--force` berisiko menghapus komit tim lain atau komit baru yang ada di server. Gunakan `git push origin main` biasa. Vercel akan secara otomatis mendeteksi komit baru di `origin/main` dan memperbarui tampilan web live (`cakaiuniverseindonesia.vercel.app`) dalam 1–2 menit.

---

## 5. PERLINDUNGAN DATABASE SUPABASE (DATABASE SAFETY RULES)

Database Production saat ini berada di Supabase Cloud:
* **URL Production:** `https://hrsdzstbizbkrniczizo.supabase.co`

### ⛔ Larangan Keras (Banned Database Operations):
1. **DILARANG KERAS** menjalankan `npx supabase db reset` pada Supabase Production. Perintah ini akan memformat & **menghapus seluruh isi database**!
2. **DILARANG KERAS** me-run skrip SQL `DROP TABLE` atau `TRUNCATE` pada tabel utama (`sw_naskah`, `sw_gen_jobs`, `sw_batches`, `sw_personas`, `sw_strategist_briefs`, `sw_knowledge`, `sw_clients`).
3. **DILARANG KERAS** mengubah skema tabel di Supabase Dashboard tanpa mencatat perubahannya di file migration `supabase/migrations/`.

### 🔍 Skema Tabel Utama yang Harus Dipertahankan:
* `sw_gen_jobs`: Tabel antrean background job untuk generasi naskah massal.
* `sw_naskah`: Tabel master naskah yang terhubung ke batch & brief.
* `sw_naskah_versions`: Tabel revisi shot-by-shot naskah.
* `sw_qc_flags`: Tabel catatan kesalahan QC (banned words, required words, tone deviation).
* `sw_knowledge`: Tabel penyimpanKnowledge Base riset tren & ekstraksi konten kompetitor.
* `sw_personas`: Tabel karakter talent AI & aturan suaranya.

---

## 6. KONFIGURASI OTOMATIS UNTUK AI AGENT (CLAUDE CODE / CURSOR / ANTIGRAVITY)

Untuk mencegah AI Agent (seperti Claude Code CLI, Antigravity, atau Cursor) kebingungan di masa mendatang, **dua file proteksi telah otomatis dibuat** di dalam repositori `caketing`:

1. `F:\KERJAAN\CAK AI\caketing\CLAUDE.md`
2. `F:\KERJAAN\CAK AI\caketing\AGENTS.md`

### 💡 Bagaimana Cara Kerjanya?
Setiap kali kamu membuka **Claude Code CLI** atau **Antigravity Agent** di dalam folder `F:\KERJAAN\CAK AI\caketing`, AI Agent akan **secara otomatis membaca file `CLAUDE.md` / `AGENTS.md` tersebut di latar belakang**.

File tersebut menginstruksikan AI Agent bahwa:
- Workspace `caketing` adalah **satu-satunya lokasi aktif**.
- Folder `cakai-ecosystem` adalah **STALE/DEAD** dan tidak boleh disentuh.
- `git push --force` dilarang keras.
- Panggilan `vitest` dan `npm run build` wajib dijalankan sebelum membuat komit.

Dengan begitu, kamu maupun AI Agent yang kamu perintahkan **tidak akan pernah lagi salah push, menimpa repositori, atau merusak data database!** 🚀

---
*Panduan ini disusun sebagai standar operasional prosedur (SOP) pengelolalan repositori CAKETING & CAK VIDEO STUDIO.*
