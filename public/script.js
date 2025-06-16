const form = document.getElementById("uploadForm");
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);

    try {
      const res = await fetch("/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("アップロード失敗");
      const data = await res.json();
      alert("アップロード完了");
      form.reset();
      loadGallery(); // アップロード後にギャラリー再読み込み
    } catch (err) {
      console.error(err);
      alert("アップロードに失敗しました");
    }
  });
}

// ギャラリーの全データ取得・表示
async function loadGallery(page = 1) {
  try {
    const res = await fetch(`/gallery-data?page=${page}`);
    if (!res.ok) throw new Error("ギャラリー取得失敗");
    const data = await res.json();
    if (!Array.isArray(data.posts)) throw new Error("レスポンス形式が不正です");
    displayImages(data.posts, "gallery");
  } catch (err) {
    console.error(err);
    const container = document.getElementById("gallery");
    if (container) container.textContent = "画像の取得に失敗しました";
  }
}

function displayImages(images, containerId = "gallery") {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";

  images.forEach((item) => {
    const card = document.createElement("div");
    card.className = "card";

    const img = document.createElement("img");
    let imgUrl = item.imageUrls[0];
    if (imgUrl.includes("/upload/")) {
      imgUrl = imgUrl.replace("/upload/", "/upload/w_600,h_400,c_fill/");
    }
    img.src = imgUrl;
    img.alt = item.tags.length ? item.tags.join(", ") : "uploaded image";
    img.style.maxWidth = "200px";
    img.style.margin = "10px";

    const tags = document.createElement("p");
    tags.textContent = "タグ: " + item.tags.join(", ");

    card.appendChild(img);
    card.appendChild(tags);
    container.appendChild(card);
  });
}

// 検索実行
async function searchImages() {
  const keyword = document.getElementById("searchInput").value.trim();
  if (!keyword) return alert("検索キーワードを入力してください");

  try {
    const res = await fetch(`/search?tag=${encodeURIComponent(keyword)}`);
    if (!res.ok) throw new Error("検索失敗");
    const data = await res.json();
    displayResults(data);
  } catch (err) {
    console.error(err);
    alert("検索に失敗しました");
  }
}

// タグ一覧の表示とクリック時の検索
async function loadTags() {
  try {
    const res = await fetch("/tags");
    if (!res.ok) throw new Error("タグ取得失敗");
    const tags = await res.json();
    const tagList = document.getElementById("tagList");
    if (!tagList) return;
    tagList.innerHTML = "";

    tags.forEach((tag) => {
      const tagLink = document.createElement("a");
      tagLink.className = "tag";
      tagLink.href = "#";
      tagLink.textContent = tag;

      tagLink.addEventListener("click", async (event) => {
        event.preventDefault();
        try {
          const res = await fetch("/search?tag=" + encodeURIComponent(tag));
          if (!res.ok) throw new Error("タグ検索失敗");
          const data = await res.json();
          displayResults(data);
        } catch (err) {
          console.error(err);
          alert("タグ検索に失敗しました");
        }
      });

      tagList.appendChild(tagLink);
    });
  } catch (err) {
    console.error(err);
    const tagList = document.getElementById("tagList");
    if (tagList) tagList.textContent = "タグの取得に失敗しました";
  }
}

function displayResults(images) {
  const container = document.getElementById("results");
  if (!container) return;
  container.innerHTML = "";

  images.forEach((item) => {
    const card = document.createElement("div");
    card.className = "card";

    const link = document.createElement("a");
    link.href = `/gallery.html?id=${item.id}`;

    const img = document.createElement("img");
    let imgUrl = item.imageUrls[0];
    if (imgUrl.includes("/upload/")) {
      imgUrl = imgUrl.replace("/upload/", "/upload/w_600,h_400,c_fill/");
    }
    img.src = imgUrl;
    img.alt = item.tags.length ? item.tags.join(", ") : "uploaded image";

    link.appendChild(img);
    card.appendChild(link);

    const tags = document.createElement("p");
    tags.textContent = "タグ: " + item.tags.join(", ");
    card.appendChild(tags);

    container.appendChild(card);
  });
}

async function loadCarousel() {
  const carousel = document.getElementById("carousel");
  if (!carousel) return;

  const inner = document.createElement("div");
  inner.className = "carousel-inner";
  carousel.appendChild(inner);

  try {
    const res = await fetch("/gallery-data");
    if (!res.ok) throw new Error("カルーセル画像取得失敗");
    const data = await res.json();

    if (!Array.isArray(data.posts) || data.posts.length === 0) return;

    const shuffled = data.posts.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 5);

    selected.forEach((item) => {
      let imgUrl = item.imageUrls[0];
      if (imgUrl.includes("/upload/")) {
        imgUrl = imgUrl.replace("/upload/", "/upload/w_800,h_500,c_fill/");
      }

      const img = document.createElement("img");
      img.src = imgUrl;
      img.alt = item.tags.length ? item.tags.join(", ") : "carousel image";

      inner.appendChild(img);
    });

    // スライド制御
    let index = 0;

    function updateSlide() {
      const slideWidth = carousel.clientWidth;
      inner.style.transform = `translateX(-${index * slideWidth}px)`;
    }

    setInterval(() => {
      index = (index + 1) % selected.length;
      updateSlide();
    }, 3000);

    window.addEventListener("resize", updateSlide);
    updateSlide(); // 初期表示も更新
  } catch (err) {
    console.error(err);
    carousel.textContent = "画像の読み込みに失敗しました";
  }
}

  const loginBtn = document.getElementById("admin-login-btn");
  const loginMsg = document.getElementById("login-message");

  loginBtn.addEventListener("click", async () => {
    const username = document.getElementById("admin-username").value;
    const password = document.getElementById("admin-password").value;

    try {
      const res = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "ログインに失敗しました");
      }

      const json = await res.json(); // { token: "..." }
      localStorage.setItem("token", json.token);
      loginMsg.textContent = "ログイン成功";
      loginMsg.style.color = "green";

      location.reload(); // ページ再読み込みして管理者権限を反映
    } catch (e) {
      loginMsg.textContent = e.message;
      loginMsg.style.color = "red";
    }
  });

  function getUserFromToken() {
    const token = localStorage.getItem("token");
    if (!token) return null;
  
    try {
      const payload = JSON.parse(atob(token.split(".")[1])); // JWTの中身
      return payload; // { id, username, isAdmin }
    } catch (e) {
      return null;
    }
  }
  


// ページ初期読み込み
loadTags();
loadGallery();
loadCarousel(); // ← こちらが正しい関数名
