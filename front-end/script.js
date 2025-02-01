document.addEventListener("DOMContentLoaded", function () {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  // 🚀 Registrasi User
  if (registerForm) {
    registerForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      let name = document.getElementById("registerName").value.trim();
      let phoneNumber = document.getElementById("registerPhone").value.trim();
      let email = document.getElementById("registerEmail").value.trim();
      let password = document.getElementById("registerPassword").value.trim();

      // ✅ Validasi Nomor Telepon
      if (
        phoneNumber.length < 10 ||
        phoneNumber.length > 13 ||
        isNaN(phoneNumber)
      ) {
        alert("Nomor telepon harus 10-13 digit dan hanya berisi angka!");
        return;
      }

      let userData = { name, phoneNumber, email, password };

      try {
        const response = await fetch(
          "http://localhost:5000/api/users/register",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(userData),
          }
        );

        const data = await response.json();
        if (response.ok) {
          alert("Registrasi berhasil! Silakan login.");
          window.location.href = "index.html"; // Redirect ke halaman login
        } else {
          alert(`Registrasi gagal: ${data.message}`);
        }
      } catch (error) {
        console.error("Error:", error);
        alert("Terjadi kesalahan, coba lagi.");
      }
    });
  }

  // 🚀 Login User
  if (loginForm) {
    loginForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      let email = document.getElementById("loginEmail").value.trim();
      let password = document.getElementById("loginPassword").value.trim();

      try {
        const response = await fetch("http://localhost:5000/api/users/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();
        if (response.ok) {
          localStorage.setItem("token", data.token);
          // alert("Login berhasil!");
          window.location.href = "main.html"; // Redirect ke halaman utama
        } else {
          alert(`Login gagal: ${data.message}`);
        }
      } catch (error) {
        console.error("Error:", error);
        alert("Terjadi kesalahan, coba lagi.");
      }
    });
  }

  // 🔒 Cek apakah user sudah login di halaman utama
  if (window.location.pathname.includes("main.html")) {
    let token = localStorage.getItem("token");
    if (!token) {
      alert("Silakan login terlebih dahulu!");
      window.location.href = "index.html"; // Redirect ke halaman login
    }
  }
});

// 🔓 Fungsi Logout
function logout() {
  localStorage.removeItem("token");
  window.location.href = "index.html"; // Redirect ke halaman login
}

// 🧑‍💻 Fungsi Buka Profil (Hanya untuk Navigasi)
function openProfile() {
  window.location.href = "profile.html";
}

// 🧑‍💻 Fungsi Buka Edit Profil (misalnya menuju halaman edit profil)
function openEditProfile() {
  window.location.href = "edit-profile.html";
}

// 🛠️ Fungsi Load Data Profil (Dipanggil saat halaman profil dimuat)
function loadProfileData() {
  const token = localStorage.getItem("token");

  if (!token) {
    alert("Silakan login terlebih dahulu!");
    window.location.href = "index.html";
    return;
  }

  fetch("http://localhost:5000/api/users/profile", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((response) => {
      if (!response.ok) throw new Error("Gagal memuat profil");
      return response.json();
    })
    .then((profileData) => {
      document.getElementById("profile-name").textContent = profileData.name;
      document.getElementById("profile-phone").textContent =
        profileData.phoneNumber;
      document.getElementById("profile-email").textContent = profileData.email;
    })
    .catch((error) => {
      console.error(error);
      alert("Terjadi kesalahan saat mengambil data profil");
    });
}

// Panggil loadProfileData saat halaman profil dimuat
if (window.location.pathname.includes("profile.html")) {
  loadProfileData();
}

// 🗑️ Fungsi Hapus Akun
function deleteAccount() {
  if (
    !confirm(
      "Apakah Anda yakin ingin menghapus akun Anda? Tindakan ini tidak dapat dibatalkan."
    )
  ) {
    return;
  }

  const token = localStorage.getItem("token");
  if (!token) {
    alert("Anda belum login!");
    return;
  }

  fetch("http://localhost:5000/api/users/profile", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
  })
    .then(async (response) => {
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Gagal menghapus akun");
      }
      return response.json();
    })
    .then((data) => {
      alert(data.message || "Akun berhasil dihapus");
      localStorage.removeItem("token");
      window.location.href = "index.html"; // Redirect ke halaman login
    })
    .catch((error) => {
      console.error("Error:", error);
      alert("Terjadi kesalahan: " + error.message);
    });
}
