import { apiCall } from '../config.js';
import { hideGlobalLoading, setButtonLoading, showGlobalLoading } from '../utils/loading.js';

const questions = [
  { text: 'Saya sulit untuk menjadi tenang.', scale: 'stress' },
  { text: 'Saya merasa mulut saya kering.', scale: 'anxiety' },
  { text: 'Saya tidak dapat merasakan perasaan positif sama sekali.', scale: 'depression' },
  { text: 'Saya mengalami kesulitan bernapas tanpa aktivitas fisik berat.', scale: 'anxiety' },
  { text: 'Saya merasa sulit untuk memulai sesuatu.', scale: 'depression' },
  { text: 'Saya cenderung bereaksi berlebihan terhadap situasi.', scale: 'stress' },
  { text: 'Saya merasa gemetar, misalnya pada tangan.', scale: 'anxiety' },
  { text: 'Saya merasa menghabiskan banyak energi karena cemas atau tegang.', scale: 'stress' },
  { text: 'Saya khawatir terhadap situasi yang mungkin membuat saya panik.', scale: 'anxiety' },
  { text: 'Saya merasa tidak ada hal yang dapat saya nantikan.', scale: 'depression' },
  { text: 'Saya merasa gelisah.', scale: 'stress' },
  { text: 'Saya sulit untuk rileks.', scale: 'stress' },
  { text: 'Saya merasa sedih dan murung.', scale: 'depression' },
  { text: 'Saya tidak sabar ketika sesuatu menghambat saya.', scale: 'stress' },
  { text: 'Saya merasa hampir panik.', scale: 'anxiety' },
  { text: 'Saya tidak dapat merasa antusias terhadap apa pun.', scale: 'depression' },
  { text: 'Saya merasa diri saya tidak berharga.', scale: 'depression' },
  { text: 'Saya merasa mudah tersinggung.', scale: 'stress' },
  { text: 'Saya menyadari detak jantung saya tanpa aktivitas fisik.', scale: 'anxiety' },
  { text: 'Saya merasa takut tanpa alasan yang jelas.', scale: 'anxiety' },
  { text: 'Saya merasa hidup tidak bermakna.', scale: 'depression' },
];

const answerLabels = [
  'Tidak pernah',
  'Kadang-kadang',
  'Sering',
  'Hampir selalu',
];

let dass21StartedAt = null;

export function renderDass21() {
  const mlResult = JSON.parse(sessionStorage.getItem('curhatResult') || 'null');
  if (!mlResult) {
    window.loadView ? window.loadView('curhat') : null;
    return;
  }

  document.getElementById('app').innerHTML = `
    <main class="bg-gray-50 min-h-screen w-full px-4 py-8 sm:px-6 lg:px-10">
      <section class="max-w-4xl mx-auto bg-white border border-gray-200 rounded-lg shadow-sm">
        <div class="bg-violet-800 text-white px-5 py-4 rounded-t-lg">
          <h1 class="text-xl font-semibold">Kuesioner DASS-21</h1>
        </div>
        <form id="dass21Form" class="p-5 sm:p-6 space-y-5">
          <div class="space-y-4">
            ${questions.map((question, index) => `
              <fieldset class="border border-gray-200 rounded-lg p-4">
                <legend class="text-sm font-medium text-gray-800 px-1">${index + 1}. ${question.text}</legend>
                <div class="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-3">
                  ${answerLabels.map((label, value) => `
                    <label class="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm cursor-pointer hover:bg-violet-50">
                      <input type="radio" name="q${index}" value="${value}" class="text-violet-700" required>
                      <span>${label}</span>
                    </label>
                  `).join('')}
                </div>
              </fieldset>
            `).join('')}
          </div>
          <div class="flex justify-end">
            <button type="submit" class="w-full sm:w-auto bg-violet-800 text-white px-6 py-3 rounded-lg text-base font-medium hover:bg-gray-800 transition-colors">
              Lihat Hasil
            </button>
          </div>
        </form>
      </section>
    </main>
  `;

  dass21StartedAt = Date.now();
  document.getElementById('dass21Form').addEventListener('submit', handleSubmit);
}

async function handleSubmit(event) {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);
  const answers = questions.map((question, index) => ({
    scale: question.scale,
    value: Number(formData.get(`q${index}`)),
  }));

  const mlResult = JSON.parse(sessionStorage.getItem('curhatResult') || 'null');
  if (!mlResult?.user_input) {
    alert('Data curhat tidak ditemukan. Silakan isi curhat kembali.');
    if (window.loadView) window.loadView('curhat');
    return;
  }

  const submitButton = event.currentTarget.querySelector('button[type="submit"]');
  if (submitButton?.disabled) return;

  let shouldRestoreButton = true;
  setButtonLoading(submitButton, true, 'Menghitung hasil...');
  showGlobalLoading({
    title: 'Menghitung hasil akhir...',
    message: 'Sebentar ya, hasil curhat dan kuesioner sedang disiapkan.',
  });

  try {
    const fusedResult = await apiCall('/api/history/fusion', {
      method: 'POST',
      body: JSON.stringify({
        text: mlResult.user_input,
        ml_result: mlResult,
        dass21_answers: answers,
        dass21_duration_seconds: Math.max(0, Math.round((Date.now() - (dass21StartedAt || Date.now())) / 1000)),
      }),
    });

    sessionStorage.setItem('curhatResult', JSON.stringify(fusedResult));
    if (window.loadView) {
      shouldRestoreButton = false;
      window.loadView('feedback');
    }
  } catch (error) {
    console.error('Failed to calculate fused result:', error);
    alert(`Gagal memproses hasil akhir. ${error.message}`);
  } finally {
    hideGlobalLoading();
    if (shouldRestoreButton) setButtonLoading(submitButton, false);
  }
}
