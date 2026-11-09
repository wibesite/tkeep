import { CURRENCY, prices, calculatePrice, formatMoney } from "/pricing.js?v=20261109-byn";

document.documentElement.classList.add("js");

document.querySelectorAll("[data-price]").forEach((element) => {
  const value = prices[element.dataset.price];
  const prefix = element.dataset.prefix ?? "от ";
  const suffix = element.dataset.suffix || "";
  element.textContent = `${prefix}${formatMoney(value)}${suffix}`;
});

const header = document.querySelector("#site-header");
const progress = document.querySelector("#scroll-progress");
const mobileContact = document.querySelector(".mobile-contact");
const contactSection = document.querySelector("#contact");

function updateScrollUI() {
  const scrollTop = window.scrollY;
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.width = `${scrollable > 0 ? (scrollTop / scrollable) * 100 : 0}%`;
  header.classList.toggle("scrolled", scrollTop > 42);

  if (mobileContact && contactSection) {
    const rect = contactSection.getBoundingClientRect();
    mobileContact.style.opacity = rect.top < window.innerHeight * 0.75 ? "0" : "1";
    mobileContact.style.pointerEvents = rect.top < window.innerHeight * 0.75 ? "none" : "auto";
  }
}

window.addEventListener("scroll", updateScrollUI, { passive: true });
updateScrollUI();

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("visible");
      revealObserver.unobserve(entry.target);
    });
  },
  { threshold: 0.09, rootMargin: "0px 0px -35px" }
);

document.querySelectorAll(".reveal").forEach((element, index) => {
  if (element.closest(".hero")) element.style.transitionDelay = `${Math.min(index, 3) * 90}ms`;
  revealObserver.observe(element);
});

const menuToggle = document.querySelector("#menu-toggle");
const mobileMenu = document.querySelector("#mobile-menu");

function setMenu(open) {
  menuToggle.classList.toggle("active", open);
  menuToggle.setAttribute("aria-expanded", String(open));
  mobileMenu.classList.toggle("open", open);
  mobileMenu.setAttribute("aria-hidden", String(!open));
  header.classList.toggle("menu-active", open);
  document.body.classList.toggle("menu-open", open);
}

menuToggle.addEventListener("click", () => setMenu(!mobileMenu.classList.contains("open")));
mobileMenu.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setMenu(false)));
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && mobileMenu.classList.contains("open")) setMenu(false);
});

const filterButtons = [...document.querySelectorAll("[data-filter]")];
const serviceCards = [...document.querySelectorAll(".service-card[data-category]")];
const serviceCount = document.querySelector("#service-count");

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.filter;
    filterButtons.forEach((item) => {
      const selected = item === button;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-pressed", String(selected));
    });

    let visible = 0;
    serviceCards.forEach((card) => {
      const matches = filter === "all" || card.dataset.category === filter;
      card.hidden = !matches;
      if (matches) {
        visible += 1;
        card.classList.add("visible");
      }
    });
    serviceCount.textContent = `Услуг: ${visible}`;
  });
});

const taskField = document.querySelector('textarea[name="task"]');
document.querySelectorAll("[data-service]").forEach((link) => {
  link.addEventListener("click", () => {
    const service = link.dataset.service;
    if (taskField && service) taskField.value = `Интересует: ${service}. `;
    const projectType = link.dataset.projectType;
    const input = projectType && calculator.querySelector(`input[name="projectType"][value="${projectType}"]`);
    if (input) {
      input.checked = true;
      calculateEstimate();
    }
  });
});

const projects = {
  orbit: {
    index: "01 / E-COMMERCE",
    title: "ORBIT STORE",
    text: "Концепт магазина предметов для ежедневной жизни. Сфокусировались на спокойном выборе, выразительной типографике и быстрой покупке с любого устройства.",
    task: "Пересобрать позиционирование и увеличить долю заказов с мобильных устройств.",
    result: "+28% к завершённым заказам после обновления ключевого пути.",
    stack: "Product design · Frontend · CMS · Payments"
  },
  pulse: {
    index: "02 / SAAS",
    title: "PULSE CRM",
    text: "Рабочее пространство для отдела продаж: единый поток заявок, понятная аналитика и автоматические подсказки для менеджеров.",
    task: "Заменить таблицы и разрозненные сервисы одной системой без лишних экранов.",
    result: "На 41% меньше времени на подготовку еженедельного отчёта.",
    stack: "UX research · Design system · Web app · API"
  },
  halo: {
    index: "03 / AI PRODUCT",
    title: "HALO AI",
    text: "Защищённый AI-ассистент, который работает с внутренней базой знаний, готовит документы и показывает источник каждого ответа.",
    task: "Ускорить поиск информации и сохранить контроль над корпоративными данными.",
    result: "Среднее время ответа сотруднику сократилось с 18 минут до 40 секунд.",
    stack: "LLM · RAG · Vector search · Private cloud"
  },
  northline: {
    index: "04 / LOGISTICS",
    title: "NORTHLINE",
    text: "Платформа для контроля маршрутов и документов. Собирает статусы в реальном времени и предупреждает о рисках до срыва доставки.",
    task: "Свести диспетчеризацию, документы и аналитику в один прозрачный интерфейс.",
    result: "−85% ручного переноса данных и на 22% меньше опозданий.",
    stack: "Product strategy · Maps · OCR · Integrations"
  }
};

const projectDialog = document.querySelector("#project-dialog");
const dialogFields = {
  index: document.querySelector("#dialog-index"),
  title: document.querySelector("#dialog-title"),
  text: document.querySelector("#dialog-text"),
  task: document.querySelector("#dialog-task"),
  result: document.querySelector("#dialog-result"),
  stack: document.querySelector("#dialog-stack")
};

document.querySelectorAll("[data-project]").forEach((button) => {
  button.addEventListener("click", () => {
    const project = projects[button.dataset.project];
    if (!project) return;
    Object.entries(dialogFields).forEach(([key, element]) => {
      element.textContent = project[key];
    });
    projectDialog.showModal();
  });
});

projectDialog.querySelector(".dialog-close").addEventListener("click", () => projectDialog.close());
projectDialog.addEventListener("click", (event) => {
  const rect = projectDialog.getBoundingClientRect();
  const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  if (!inside) projectDialog.close();
});
projectDialog.querySelector('a[href="#contact"]').addEventListener("click", () => projectDialog.close());

document.querySelectorAll(".faq-item").forEach((item) => {
  item.addEventListener("toggle", () => {
    if (!item.open) return;
    document.querySelectorAll(".faq-item").forEach((other) => {
      if (other !== item) other.open = false;
    });
  });
});

const calculator = document.querySelector(".calculator");
const totalElement = document.querySelector("#calc-total");

function calculateEstimate() {
  const selected = calculator.querySelector('input[name="projectType"]:checked')?.value;
  const extras = [...calculator.querySelectorAll('input[name="extras"]:checked')].map((input) => input.value);
  const total = calculatePrice(selected, extras);
  if (total === null) {
    totalElement.textContent = "по смете";
    return null;
  }

  totalElement.textContent = `от ${formatMoney(total)}`;
  totalElement.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.045)" }, { transform: "scale(1)" }],
    { duration: 320, easing: "ease-out" }
  );
  return total;
}

calculator.addEventListener("change", calculateEstimate);
calculateEstimate();

const toast = document.querySelector("#toast");
let toastTimer;
function showToast(message) {
  toast.querySelector("span").textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 4200);
}

const leadForm = document.querySelector("#lead-form");
const formStatus = document.querySelector("#form-status");
const submitButton = leadForm.querySelector('button[type="submit"]');

leadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(leadForm);
  const selectedType = formData.get("projectType");
  const extras = formData.getAll("extras");
  const payload = {
    name: String(formData.get("name") || "").trim(),
    contact: String(formData.get("contact") || "").trim(),
    task: String(formData.get("task") || "").trim(),
    company_website: String(formData.get("company_website") || ""),
    projectType: selectedType,
    extras,
    estimate: calculateEstimate(),
    currency: CURRENCY,
    source: "tkeep.ru"
  };

  submitButton.disabled = true;
  submitButton.querySelector("span").textContent = "Отправляем…";
  formStatus.textContent = "";
  formStatus.classList.remove("error");

  try {
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Не удалось отправить заявку");

    formStatus.textContent = result.message;
    showToast(result.delivery === "preview" ? "Форма проверена — подключите канал доставки" : "Заявка отправлена");
    leadForm.reset();
    calculateEstimate();
  } catch (error) {
    formStatus.textContent = error.message || "Ошибка отправки. Напишите на hello@tkeep.ru";
    formStatus.classList.add("error");
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = "Отправить заявку";
  }
});

function initCanvas() {
  const canvas = document.querySelector("#hero-canvas");
  const context = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let width = 0;
  let height = 0;
  let ratio = 1;
  let frame;
  const pointer = { x: -1000, y: -1000 };
  const nodes = Array.from({ length: 46 }, (_, index) => ({
    x: ((index * 47) % 101) / 100,
    y: ((index * 71 + 13) % 97) / 96,
    vx: ((index % 5) - 2) * 0.000018,
    vy: (((index * 3) % 5) - 2) * 0.000015,
    r: index % 7 === 0 ? 1.55 : 0.75
  }));

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    const positions = nodes.map((node) => ({ ...node, px: node.x * width, py: node.y * height }));

    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        const dx = positions[i].px - positions[j].px;
        const dy = positions[i].py - positions[j].py;
        const distance = Math.hypot(dx, dy);
        if (distance > 155) continue;
        const pointerDistance = Math.min(Math.hypot(positions[i].px - pointer.x, positions[i].py - pointer.y), 260);
        const pointerBoost = 1 - pointerDistance / 260;
        context.strokeStyle = `rgba(210, 221, 190, ${0.025 + (1 - distance / 155) * 0.075 + pointerBoost * 0.08})`;
        context.lineWidth = 0.7;
        context.beginPath();
        context.moveTo(positions[i].px, positions[i].py);
        context.lineTo(positions[j].px, positions[j].py);
        context.stroke();
      }
    }

    positions.forEach((node) => {
      const pointerDistance = Math.hypot(node.px - pointer.x, node.py - pointer.y);
      const active = pointerDistance < 150;
      context.fillStyle = active ? "rgba(223, 232, 193, .7)" : "rgba(213, 221, 198, .23)";
      context.beginPath();
      context.arc(node.px, node.py, active ? node.r * 1.8 : node.r, 0, Math.PI * 2);
      context.fill();
    });

    if (!reduceMotion) {
      nodes.forEach((node) => {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < 0 || node.x > 1) node.vx *= -1;
        if (node.y < 0 || node.y > 1) node.vy *= -1;
      });
      frame = requestAnimationFrame(draw);
    }
  }

  const hero = canvas.closest(".hero");
  hero.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
  });
  hero.addEventListener("pointerleave", () => {
    pointer.x = -1000;
    pointer.y = -1000;
  });

  window.addEventListener("resize", () => {
    resize();
    if (reduceMotion) draw();
  });
  document.addEventListener("visibilitychange", () => {
    if (reduceMotion) return;
    if (document.hidden) cancelAnimationFrame(frame);
    else frame = requestAnimationFrame(draw);
  });

  resize();
  draw();
}

initCanvas();
