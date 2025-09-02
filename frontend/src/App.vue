<template>
  <progress  v-if="isDataFetch" />
  <header class="container">
    <hgroup>
      <h1>
       🎨 Paint Battle геймтон
      </h1>
      <p>Правила игры и подробности читайте на: <a target="_blank" href="https://habr.com/ru/articles/942934/">Habr</a></p>
    </hgroup>
    <fieldset style="display: flex; align-items:center; gap:1rem">
      <label style="flex:1;">
        Срез по:
        <select v-model="levelRate">
          <option value="all"> Все уровни</option>
          <option v-for="level in LEVELS" :value="level" :key="level">
           Уровень {{ level }}
          </option>
        </select>
      </label>
      <button class="outline" @click="fetchResults">
        ⟳ Обновить
      </button>
    </fieldset>
  </header>
  <main class="container">
    <table class="rt">
      <thead>
        <tr>
          <th rowspan="2">
            Место
          </th>
          <th rowspan="2">
            Никнейм
          </th>
          <template v-for="level in selectedLevels" :key="level">
            <th colspan="3">
              Уровень {{ level }}
            </th>
          </template>
          
          <th rowspan="2">
            Общий счет
          </th>
        </tr>
        <tr>
           <template v-for="level in selectedLevels" :key="level">
            <th>
              Счет
            </th>
            <th>
              Меткость
            </th>
            <th>
              Эффективность
            </th>
          </template>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(user, index) in users">
          <td>
            {{ index+1 }}
          </td>
          <td>
            {{ user.nickname }}
          </td>
          <template v-for="level in selectedLevels" :key="level">
            <td>
              <div v-if="user.levels[level-1]">
                <a data-tooltip="Кликните для просмотра" :href="`/api/user/level?userId=${user.userId}&level=${level}`">
                  🖼️ {{ user.levels[level-1].score }} </a>
              </div>
            </td>
            <td>
              <div v-if="user.levels[level-1]">
                <span data-tooltip="Выстрелы">⌖ {{ user.levels[level-1].shots }}</span>
                <span data-tooltip="Промахи"> 🙈 {{ user.levels[level-1].miss }}</span>
                <span data-tooltip="Попадание"> 🎯 {{ 100-(user.levels[level-1].shots/100*user.levels[level-1].miss) }}%</span>
              </div>
            </td>
            <td>
              <div v-if="user.levels[level-1]">
                <span v-if="user.levels[level-1].shots" data-tooltip="Очков за выстрел">⭐ {{ (user.levels[level-1].score/user.levels[level-1].shots).toFixed(3) }}</span>
              </div>
            </td>
          </template>
          <td>
            {{ user.totalScore }}
          </td>
        </tr>
      </tbody>
    </table>
  </main>
  <footer class="container">
    <p>
      Dev with ❤️  by <a href="https://strokoff.ru">strokoff</a>
      Hosting <a href="https://beget.com/p16071">beget</a>
    </p>
  </footer>
  
</template>

<script setup lang="ts">
import { computed } from '@vue/reactivity';
import { onMounted, ref } from 'vue';
const LEVELS = 5;
type User = {
  userId: number,
  nickname: string,
  totalScore: number,
  levels: {
    level: number,
    score: number,
    id: number,
    miss: number,
    shots: number
  }[]
}
const isDataFetch = ref(true);
const users = ref<User[]>([]);
const levelRate = ref('all');
const selectedLevels = computed<number[]>(() => {
  if(levelRate.value === 'all') {
    return Array.from({ length:LEVELS }, (_, index) => index + 1);
  } else {
    return [+levelRate.value]
  }
});

function fetchResults() {
  isDataFetch.value = true;
  fetch('/api/game/results').then(resp => resp.json()).then(json => {
    users.value = json;
    isDataFetch.value = false;
  });
}

onMounted(() => {
  fetchResults();
})
</script>


<style lang="scss">

:root {
  --pico-spacing: 0.5rem;
  --pico-font-size: 12px;
  --pico-form-element-spacing-vertical: 0.25rem;
  --pico-form-element-spacing-horizontal: 0.35rem;
}
.rt {
  tbody {
    tr {
      &:nth-child(1) {
        td:nth-child(1)::before {
          content: '🥇 ';
        }
      }
      &:nth-child(2) {
        td:nth-child(1)::before {
          content: '🥈 ';
        }
      }
      &:nth-child(3) {
        td:nth-child(1)::before {
          content: '🥉 ';
        }
      }
    }
  }
}
</style>
