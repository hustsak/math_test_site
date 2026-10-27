export interface CurriculumLesson {
  id: string;
  titleKh: string;
}

export interface CurriculumChapter {
  id: string;
  chapterNumber: number;
  titleKh: string;
  lessons: CurriculumLesson[];
}

export const CAMBODIAN_MATH_CURRICULUM: Record<number, CurriculumChapter[]> = {
  7: [
    {
      id: 'g7_ch1',
      chapterNumber: 1,
      titleKh: 'ជំពូកទី ១ ៖ ចំនួនគត់រ៉ឺឡាទីប',
      lessons: [
        { id: 'g7_c1_l1', titleKh: 'មេរៀនទី ១ ៖ និយមន័យ និងការប្រៀបធៀបចំនួនគត់រ៉ឺឡាទីប' },
        { id: 'g7_c1_l2', titleKh: 'មេរៀនទី ២ ៖ វិធីបូក និងដកចំនួនគត់រ៉ឺឡាទីប' },
        { id: 'g7_c1_l3', titleKh: 'មេរៀនទី ៣ ៖ វិធីគុណ និងចែកចំនួនគត់រ៉ឺឡាទីប' },
      ],
    },
    {
      id: 'g7_ch2',
      chapterNumber: 2,
      titleKh: 'ជំពូកទី ២ ៖ ប្រភាគ និងចំនួនទសភាគ',
      lessons: [
        { id: 'g7_c2_l1', titleKh: 'មេរៀនទី ១ ៖ ប្រភាគ និងប្រមាណវិធីលើប្រភាគ' },
        { id: 'g7_c2_l2', titleKh: 'មេរៀនទី ២ ៖ ចំនួនទសភាគ និងប្រមាណវិធីលើចំនួនទសភាគ' },
      ],
    },
    {
      id: 'g7_ch3',
      chapterNumber: 3,
      titleKh: 'ជំពូកទី ៣ ៖ កន្សោមពីជគណិត និងសមីការដឺក្រេទី១',
      lessons: [
        { id: 'g7_c3_l1', titleKh: 'មេរៀនទី ១ ៖ កន្សោមពីជគណិត' },
        { id: 'g7_c3_l2', titleKh: 'មេរៀនទី ២ ៖ សមីការដឺក្រេទី១ មានមួយអញាត' },
      ],
    },
    {
      id: 'g7_ch4',
      chapterNumber: 4,
      titleKh: 'ជំពូកទី ៤ ៖ ធរណីមាត្រគ្រឹះ មុំ និងបន្ទាត់',
      lessons: [
        { id: 'g7_c4_l1', titleKh: 'មេរៀនទី ១ ៖ មុំ និងប្រភេទមុំ' },
        { id: 'g7_c4_l2', titleKh: 'មេរៀនទី ២ ៖ បន្ទាត់ស្រប និងបន្ទាត់កែង' },
        { id: 'g7_c4_l3', titleKh: 'មេរៀនទី ៣ ៖ ត្រីកោណ និងចតុកោណ' },
      ],
    },
  ],
  8: [
    {
      id: 'g8_ch1',
      chapterNumber: 1,
      titleKh: 'ជំពូកទី ១ ៖ ចំនួនសនិទាន និងស្វ័យគុណ',
      lessons: [
        { id: 'g8_c1_l1', titleKh: 'មេរៀនទី ១ ៖ ចំនួនសនិទាន' },
        { id: 'g8_c1_l2', titleKh: 'មេរៀនទី ២ ៖ ស្វ័យគុណនៃចំនួនសនិទាន' },
      ],
    },
    {
      id: 'g8_ch2',
      chapterNumber: 2,
      titleKh: 'ជំពូកទី ២ ៖ ពហុធា និងផលគុណកត្តា',
      lessons: [
        { id: 'g8_c2_l1', titleKh: 'មេរៀនទី ១ ៖ ប្រមាណវិធីលើពហុធា' },
        { id: 'g8_c2_l2', titleKh: 'មេរៀនទី ២ ៖ ការដាក់ជាផលគុណកត្តា' },
      ],
    },
    {
      id: 'g8_ch3',
      chapterNumber: 3,
      titleKh: 'ជំពូកទី ៣ ៖ សមីការ និងវិសមីការដឺក្រេទី១',
      lessons: [
        { id: 'g8_c3_l1', titleKh: 'មេរៀនទី ១ ៖ សមីការដឺក្រេទី១ មានមួយអញ្ញាត' },
        { id: 'g8_c3_l2', titleKh: 'មេរៀនទី ២ ៖ វិសមីការដឺក្រេទី១ មានមួយអញ្ញាត' },
      ],
    },
    {
      id: 'g8_ch4',
      chapterNumber: 4,
      titleKh: 'ជំពូកទី ៤ ៖ ធរណីមាត្រ ត្រីកោណ និងទ្រឹស្តីបទពីតាករ',
      lessons: [
        { id: 'g8_c4_l1', titleKh: 'មេរៀនទី ១ ៖ ត្រីកោណប៉ុនគ្នា' },
        { id: 'g8_c4_l2', titleKh: 'មេរៀនទី ២ ៖ ទ្រឹស្តីបទពីតាករ' },
      ],
    },
  ],
  9: [
    {
      id: 'g9_ch1',
      chapterNumber: 1,
      titleKh: 'ជំពូកទី ១ ៖ ចំនួនអសនិទាន និងរ៉ាឌីកាល់',
      lessons: [
        { id: 'g9_c1_l1', titleKh: 'មេរៀនទី ១ ៖ ឫសការេ និងរ៉ាឌីកាល់' },
        { id: 'g9_c1_l2', titleKh: 'មេរៀនទី ២ ៖ ប្រមាណវិធីលើរ៉ាឌីកាល់' },
      ],
    },
    {
      id: 'g9_ch2',
      chapterNumber: 2,
      titleKh: 'ជំពូកទី ២ ៖ សមីការដឺក្រេទី២',
      lessons: [
        { id: 'g9_c2_l1', titleKh: 'មេរៀនទី ១ ៖ ការដោះស្រាយសមីការដឺក្រេទី២' },
        { id: 'g9_c2_l2', titleKh: 'មេរៀនទី ២ ៖ ឌីសគ្រីមីណង់ Delta និងទំនាក់ទំនងឫស' },
      ],
    },
    {
      id: 'g9_ch3',
      chapterNumber: 3,
      titleKh: 'ជំពូកទី ៣ ៖ ប្រព័ន្ធសមីការ និងអនុគមន៍',
      lessons: [
        { id: 'g9_c3_l1', titleKh: 'មេរៀនទី ១ ៖ ប្រព័ន្ធសមីការដឺក្រេទី១ មានពីរអញ្ញាត' },
        { id: 'g9_c3_l2', titleKh: 'មេរៀនទី ២ ៖ អនុគមន៍លីនេអ៊ែរ និងអនុគមន៍ដឺក្រេទី២' },
      ],
    },
    {
      id: 'g9_ch4',
      chapterNumber: 4,
      titleKh: 'ជំពូកទី ៤ ៖ ធរណីមាត្រ រង្វង់ និងត្រីកោណមាត្រ',
      lessons: [
        { id: 'g9_c4_l1', titleKh: 'មេរៀនទី ១ ៖ ផលធៀបត្រីកោណមាត្រនៃមុំស្រួច' },
        { id: 'g9_c4_l2', titleKh: 'មេរៀនទី ២ ៖ មុំក្នុងរង្វង់ និងអង្កត់ធ្នូ' },
      ],
    },
  ],
  10: [
    {
      id: 'g10_ch1',
      chapterNumber: 1,
      titleKh: 'ជំពូកទី ១ ៖ តក្កវិទ្យា និងសំណុំ',
      lessons: [
        { id: 'g10_c1_l1', titleKh: 'មេរៀនទី ១ ៖ សំណើ និងតក្កវិទ្យា' },
        { id: 'g10_c1_l2', titleKh: 'មេរៀនទី ២ ៖ សំណុំ និងប្រតិបត្តិការលើសំណុំ' },
      ],
    },
    {
      id: 'g10_ch2',
      chapterNumber: 2,
      titleKh: 'ជំពូកទី ២ ៖ សមីការ វិសមីការ និងប្រព័ន្ធសមីការ',
      lessons: [
        { id: 'g10_c2_l1', titleKh: 'មេរៀនទី ១ ៖ សមីការ និងវិសមីការដឺក្រេទី២' },
        { id: 'g10_c2_l2', titleKh: 'មេរៀនទី ២ ៖ សមីការ និងវិសមីការអសនិទាន' },
      ],
    },
    {
      id: 'g10_ch3',
      chapterNumber: 3,
      titleKh: 'ជំពូកទី ៣ ៖ ត្រីកោណមាត្រ',
      lessons: [
        { id: 'g10_c3_l1', titleKh: 'មេរៀនទី ១ ៖ ផលធៀប និងរូបមន្តត្រីកោណមាត្រ' },
        { id: 'g10_c3_l2', titleKh: 'មេរៀនទី ២ ៖ សមីការត្រីកោណមាត្រ' },
      ],
    },
    {
      id: 'g10_ch4',
      chapterNumber: 4,
      titleKh: 'ជំពូកទី ៤ ៖ វ៉ិចទ័រ និងធរណីមាត្រក្នុងប្លង់',
      lessons: [
        { id: 'g10_c4_l1', titleKh: 'មេរៀនទី ១ ៖ វ៉ិចទ័រក្នុងប្លង់' },
        { id: 'g10_c4_l2', titleKh: 'មេរៀនទី ២ ៖ ផលគុណស្កាលែ' },
      ],
    },
  ],
  11: [
    {
      id: 'g11_ch1',
      chapterNumber: 1,
      titleKh: 'ជំពូកទី ១ ៖ ស្វ៊ីតចំនួនពិត',
      lessons: [
        { id: 'g11_c1_l1', titleKh: 'មេរៀនទី ១ ៖ ស្វ៊ីតនព្វន្ត' },
        { id: 'g11_c1_l2', titleKh: 'មេរៀនទី ២ ៖ ស្វ៊ីតធរណីមាត្រ' },
      ],
    },
    {
      id: 'g11_ch2',
      chapterNumber: 2,
      titleKh: 'ជំពូកទី ២ ៖ អនុគមន៍អិចស្ប៉ូណង់ស្យែល និងលោការីត',
      lessons: [
        { id: 'g11_c2_l1', titleKh: 'មេរៀនទី ១ ៖ អនុគមន៍អិចស្ប៉ូណង់ស្យែល' },
        { id: 'g11_c2_l2', titleKh: 'មេរៀនទី ២ ៖ អនុគមន៍លោការីត' },
      ],
    },
    {
      id: 'g11_ch3',
      chapterNumber: 3,
      titleKh: 'ជំពូកទី ៣ ៖ លីមីត និងដេរីវេ',
      lessons: [
        { id: 'g11_c3_l1', titleKh: 'មេរៀនទី ១ ៖ លីមីតនៃអនុគមន៍' },
        { id: 'g11_c3_l2', titleKh: 'មេរៀនទី ២ ៖ ដេរីវេ និងអនុវត្តន៍នៃដេរីវេ' },
      ],
    },
    {
      id: 'g11_ch4',
      chapterNumber: 4,
      titleKh: 'ជំពូកទី ៤ ៖ កោនិក',
      lessons: [
        { id: 'g11_c4_l1', titleKh: 'មេរៀនទី ១ ៖ ប៉ារ៉ាបូល' },
        { id: 'g11_c4_l2', titleKh: 'មេរៀនទី ២ ៖ អេលីប និងអ៊ីពែបូល' },
      ],
    },
  ],
  12: [
    {
      id: 'g12_ch1',
      chapterNumber: 1,
      titleKh: 'ជំពូកទី ១ ៖ លីមីត និងភាពជាប់',
      lessons: [
        { id: 'g12_c1_l1', titleKh: 'មេរៀនទី ១ ៖ លីមីត និងភាពជាប់នៃអនុគមន៍' },
        { id: 'g12_c1_l2', titleKh: 'មេរៀនទី ២ ៖ អាស៊ីមតូត' },
      ],
    },
    {
      id: 'g12_ch2',
      chapterNumber: 2,
      titleKh: 'ជំពូកទី ២ ៖ ដេរីវេ និងការសិក្សាអនុគមន៍',
      lessons: [
        { id: 'g12_c2_l1', titleKh: 'មេរៀនទី ១ ៖ ដេរីវេ និងទិសដៅអថេរភាព' },
        { id: 'g12_c2_l2', titleKh: 'មេរៀនទី ២ ៖ ការសង់ខ្សែរោងអនុគមន៍' },
      ],
    },
    {
      id: 'g12_ch3',
      chapterNumber: 3,
      titleKh: 'ជំពូកទី ៣ ៖ អាំងតេក្រាល និងអនុវត្តន៍',
      lessons: [
        { id: 'g12_c3_l1', titleKh: 'មេរៀនទី ១ ៖ ព្រីមីទីវ និងអាំងតេក្រាលមិនកំណត់' },
        { id: 'g12_c3_l2', titleKh: 'មេរៀនទី ២ ៖ អាំងតេក្រាលកំណត់ និងគណនាក្រឡាផ្ទៃ' },
      ],
    },
    {
      id: 'g12_ch4',
      chapterNumber: 4,
      titleKh: 'ជំពូកទី ៤ ៖ ចំនួនកុំផ្លិច',
      lessons: [
        { id: 'g12_c4_l1', titleKh: 'មេរៀនទី ១ ៖ ទម្រង់ពិជគណិតនៃចំនួនកុំផ្លិច' },
        { id: 'g12_c4_l2', titleKh: 'មេរៀនទី ២ ៖ ទម្រង់ត្រីកោណមាត្រ និងស្វ័យគុណ' },
      ],
    },
    {
      id: 'g12_ch5',
      chapterNumber: 5,
      titleKh: 'ជំពូកទី ៥ ៖ ប្រូបាប៊ីលីតេ',
      lessons: [
        { id: 'g12_c5_l1', titleKh: 'មេរៀនទី ១ ៖ ចំនួនរៀប និងបន្សំ' },
        { id: 'g12_c5_l2', titleKh: 'មេរៀនទី ២ ៖ ការគណនាប្រូបាប' },
      ],
    },
  ],
};

export function getCurriculumForGrade(grade: number): CurriculumChapter[] {
  return CAMBODIAN_MATH_CURRICULUM[grade] || [];
}
