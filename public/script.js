const form = document.getElementById("uploadForm");
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);

    const res = await fetch("/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    alert("アップロード完了");
    form.reset();
  });
}

// ギャラリーの全データ取得・表示
async function loadGallery() {
  const res = await fetch("/gallery");
  const data = await res.json();
  displayImages(data, "gallery");
}

function displayImages(images, containerId = "gallery") {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  images.forEach((item) => {
    const card = document.createElement("div");
    card.className = "card";

    const img = document.createElement("img");
    img.src = item.imageUrls[0];
    img.alt = item.tags.join(", ");
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
  const keyword = document.getElementById("searchInput").value;
  const res = await fetch(`/search?tag=${encodeURIComponent(keyword)}`);
  const data = await res.json();
  displayImages(data, "results");
}

// タグ一覧の表示とクリック時の検索
async function loadTags() {
  const res = await fetch("/tags");
  const tags = await res.json();
  const tagList = document.getElementById("tagList");

  tags.forEach((tag) => {
    const tagLink = document.createElement("a");
    tagLink.className = "tag";
    tagLink.href = "#";
    tagLink.textContent = tag;
    tagLink.onclick = async () => {
      const res = await fetch("/search?tag=" + encodeURIComponent(tag));
      const data = await res.json();
      displayResults(data);
    };
    tagList.appendChild(tagLink);
  });
}

function displayResults(images) {
  const container = document.getElementById("results");
  container.innerHTML = "";
  images.forEach((item) => {
    const card = document.createElement("div");
    card.className = "card";

    const link = document.createElement("a");
    link.href = `/gallery.html?id=${item.id}`;

    const img = document.createElement("img");
    img.src = item.imageUrls[0];
    img.alt = item.tags.join(", ");

    link.appendChild(img);
    card.appendChild(link);

    const tags = document.createElement("p");
    tags.textContent = "タグ: " + item.tags.join(", ");
    card.appendChild(tags);

    container.appendChild(card);
  });
}

// ✅ カルーセルの表示（index.html用）
async function loadCarouselImages() {
  const carousel = document.getElementById("carousel");
  if (!carousel) return;

  const res = await fetch("/gallery-data");
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return;

  // ランダムに5件選択
  const shuffled = data.sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, 5);

  selected.forEach((item) => {
    const originalUrl = item.imageUrls[0];

    // Cloudinary画像のサムネイルURLに変換（例: 幅600, 高さ400で自動クロップ）
    const optimizedUrl = originalUrl.replace(
      "/upload/",
      "/upload/w_600,h_400,c_fill/"
    );

    const img = document.createElement("img");
    img.src = optimizedUrl;
    img.alt = item.tags.join(", ");
    carousel.appendChild(img);
  });

  // スライド表示
  let index = 0;
  setInterval(() => {
    index = (index + 1) % selected.length;
    carousel.style.transform = `translateX(-${index * 100}%)`;
  }, 3000);
}

// ✅ 初期読み込み
loadTags();
loadCarouselImages();
