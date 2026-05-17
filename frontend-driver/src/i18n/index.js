/**
 * src/i18n/index.js
 * i18next configuration with English, Russian, Spanish
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      // Auth
      login:            'Log In',
      email:            'Email',
      password:         'Password',
      logout:           'Log Out',
      welcome:          'Welcome',

      // Status
      status:           'Status',
      off_duty:         'Off Duty',
      sleeper_berth:    'Sleeper Berth',
      driving:          'Driving',
      on_duty:          'On Duty',
      change_status:    'Change Status',

      // HOS Clocks
      driving_time:     'Driving',
      shift_time:       'Shift',
      cycle_time:       'Cycle',
      time_remaining:   'remaining',
      break_needed:     'Break needed in',
      hours_short:      'h',
      minutes_short:    'm',

      // Annotations
      personal_conveyance: 'Personal Conveyance',
      yard_move:           'Yard Move',

      // Logbook
      logbook:          'Logbook',
      today:            'Today',
      certify:          'Certify Log',
      certified:        'Certified',
      edit_reason:      'Reason for edit',

      // DVIR
      dvir:             'Vehicle Inspection',
      pre_trip:         'Pre-Trip',
      post_trip:        'Post-Trip',
      no_defects:       'No defects found',
      defects_found:    'Defects found',
      sign_here:        'Sign here',

      // DOT Transfer
      dot_transfer:     'DOT Transfer',
      transfer_data:    'Transfer Data to Inspector',

      // Violations
      violations:       'Violations',
      warnings:         'Warnings',
      no_violations:    'No active violations',

      // Trip
      current_trip:     'Current Trip',
      no_trip:          'No trip assigned',

      // Common
      save:             'Save',
      cancel:           'Cancel',
      confirm:          'Confirm',
      loading:          'Loading...',
      error:            'Error',
      success:          'Success',
      note:             'Note (optional)',
    },
  },

  ru: {
    translation: {
      login:            'Войти',
      email:            'Email',
      password:         'Пароль',
      logout:           'Выйти',
      welcome:          'Добро пожаловать',

      status:           'Статус',
      off_duty:         'Выходной',
      sleeper_berth:    'Спальное место',
      driving:          'Вождение',
      on_duty:          'На работе',
      change_status:    'Сменить статус',

      driving_time:     'Вождение',
      shift_time:       'Смена',
      cycle_time:       'Цикл',
      time_remaining:   'осталось',
      break_needed:     'Перерыв через',
      hours_short:      'ч',
      minutes_short:    'м',

      personal_conveyance: 'Личная поездка',
      yard_move:           'Движение по двору',

      logbook:          'Журнал',
      today:            'Сегодня',
      certify:          'Подписать журнал',
      certified:        'Подписан',
      edit_reason:      'Причина изменения',

      dvir:             'Осмотр транспорта',
      pre_trip:         'До рейса',
      post_trip:        'После рейса',
      no_defects:       'Дефектов не найдено',
      defects_found:    'Найдены дефекты',
      sign_here:        'Подпись здесь',

      dot_transfer:     'Передача DOT',
      transfer_data:    'Передать данные инспектору',

      violations:       'Нарушения',
      warnings:         'Предупреждения',
      no_violations:    'Нет активных нарушений',

      current_trip:     'Текущий рейс',
      no_trip:          'Рейс не назначен',

      save:             'Сохранить',
      cancel:           'Отмена',
      confirm:          'Подтвердить',
      loading:          'Загрузка...',
      error:            'Ошибка',
      success:          'Успешно',
      note:             'Заметка (необязательно)',
    },
  },

  es: {
    translation: {
      login:            'Iniciar sesión',
      email:            'Correo',
      password:         'Contraseña',
      logout:           'Cerrar sesión',
      welcome:          'Bienvenido',

      status:           'Estado',
      off_duty:         'Fuera de servicio',
      sleeper_berth:    'Litera',
      driving:          'Conduciendo',
      on_duty:          'En servicio',
      change_status:    'Cambiar estado',

      driving_time:     'Conducción',
      shift_time:       'Turno',
      cycle_time:       'Ciclo',
      time_remaining:   'restante',
      break_needed:     'Descanso en',
      hours_short:      'h',
      minutes_short:    'm',

      personal_conveyance: 'Uso personal',
      yard_move:           'Movimiento en patio',

      logbook:          'Bitácora',
      today:            'Hoy',
      certify:          'Certificar registro',
      certified:        'Certificado',
      edit_reason:      'Razón del cambio',

      dvir:             'Inspección del vehículo',
      pre_trip:         'Pre-viaje',
      post_trip:        'Post-viaje',
      no_defects:       'Sin defectos',
      defects_found:    'Defectos encontrados',
      sign_here:        'Firmar aquí',

      dot_transfer:     'Transferencia DOT',
      transfer_data:    'Transferir datos al inspector',

      violations:       'Infracciones',
      warnings:         'Advertencias',
      no_violations:    'Sin infracciones activas',

      current_trip:     'Viaje actual',
      no_trip:          'Sin viaje asignado',

      save:             'Guardar',
      cancel:           'Cancelar',
      confirm:          'Confirmar',
      loading:          'Cargando...',
      error:            'Error',
      success:          'Éxito',
      note:             'Nota (opcional)',
    },
  },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng:              localStorage.getItem('language') || 'en',
    fallbackLng:      'en',
    interpolation:    { escapeValue: false },
  });

export default i18n;
