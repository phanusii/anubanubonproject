# คู่มือสร้างบัญชีผู้ดูแลระบบ (Admin) — ทำก่อน deploy

หลังการแก้ไขนี้ หน้า `/admin/login` ใช้ **Firebase Authentication เท่านั้น** (ไม่มีรหัสผ่านฝังในโค้ดอีกต่อไป)
ดังนั้นต้องสร้างบัญชีแอดมินใน Firebase ก่อน ไม่งั้นจะเข้าหน้าแอดมินไม่ได้

## ขั้นตอน (ทำครั้งเดียว)

### 1. เปิดใช้งาน Email/Password
1. เข้า [Firebase Console](https://console.firebase.google.com/) → เลือกโปรเจกต์ **anubanubonproject**
2. เมนูซ้าย → **Build → Authentication** → กด **Get started** (ถ้ายังไม่เคยเปิด)
3. แท็บ **Sign-in method** → เลือก **Email/Password** → เปิดสวิตช์ **Enable** → **Save**

### 2. เพิ่มบัญชีแอดมิน
1. แท็บ **Users** → กด **Add user**
2. กรอก **Email** = อีเมลแอดมินของคุณ (ต้องตรงกับที่กำหนดใน `firestore.rules` / `storage.rules`)
3. ตั้ง **Password** ที่ปลอดภัย (อย่างน้อย 8–12 ตัว มีตัวเลข/ตัวอักษร/อักขระพิเศษ ห้ามใช้ `1234`)
4. กด **Add user**

### 3. (สำคัญ) ทำให้ email_verified = true
Rules กำหนดให้แอดมินต้องเป็นอีเมลที่ยืนยันแล้ว (`email_verified == true`) เลือกวิธีใดวิธีหนึ่ง:

- **วิธีง่าย (แนะนำ):** ใช้ Firebase Admin SDK/CLI ตั้งค่าให้ครั้งเดียว
  ```bash
  # ต้องมี service account key และ Node ติดตั้งไว้
  node -e "const a=require('firebase-admin');a.initializeApp();a.auth().getUserByEmail('อีเมลแอดมิน').then(u=>a.auth().updateUser(u.uid,{emailVerified:true})).then(()=>console.log('verified')).catch(console.error)"
  ```
- **หรือ** ให้แอดมินล็อกอินแอปครั้งแรกแล้วกดยืนยันอีเมลจากลิงก์ที่ Firebase ส่งให้ (ต้องเพิ่มปุ่ม "ส่งอีเมลยืนยัน" — แจ้งผมได้ถ้าต้องการให้เพิ่ม)

> หมายเหตุ: ถ้าไม่อยากบังคับ `email_verified` สามารถลบเงื่อนไข `&& request.auth.token.email_verified == true`
> ออกจาก `firestore.rules` และ `storage.rules` ได้ แต่จะปลอดภัยน้อยลงเล็กน้อย

### 4. เปลี่ยนอีเมลแอดมินใน Rules (ถ้าใช้อีเมลอื่น)
เปิด `firestore.rules` และ `storage.rules` แล้วแก้ค่าอีเมลในฟังก์ชัน `adminEmail()` / `isAdmin()`
ให้ตรงกับอีเมลที่สร้างไว้ในขั้นตอนที่ 2 จากนั้น deploy:
```bash
firebase deploy --only firestore:rules,storage
```

## ทดสอบ
เข้า `/admin/login` → กรอกอีเมล/รหัสผ่านที่สร้างไว้ → ต้องเข้า `/admin/dashboard` ได้
ถ้าขึ้น "อีเมลหรือรหัสผ่านไม่ถูกต้อง..." ให้ตรวจว่า (ก) เปิด Email/Password แล้ว (ข) บัญชีถูกสร้าง
(ค) อีเมลตรงกับใน rules และ (ง) `email_verified == true`
