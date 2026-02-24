/**
 * Report table headers (and search form labels) for employee reports.
 * English (en) and Bangla (bn). Use with currentLang to pick labels[lang][key].
 */
export type ReportLabelKey = keyof typeof REPORT_LABELS.en;

export const REPORT_LABELS = {
    en: {
        'report.pageTitle': 'Employee Reports',
        'report.reportTypeLabel': 'Report type',
        'report.placeholderReportType': 'Select report type',
        'report.commonCodeLabel': 'Common Code',
        'report.placeholderCommonCode': 'Select common code',

        'report.title.memberAppointment': 'Type of member / appointment category / wing / battalion / mother organization',
        'report.title.batchCourse': 'Service length, Batch/course (e.g. 31st BCS / 71 BMA LC)',
        'report.title.education': 'Honors / higher education subjects',

        'report.search.createList': 'Search',
        'report.search.motherOrg': 'Mother Organization',
        'report.search.rank': 'Rank',
        'report.search.trade': 'Trade',
        'report.search.joiningDateFrom': 'Joining Date From',
        'report.search.joiningDateTo': 'Joining Date To',
        'report.search.courseBatch': 'Course / Batch',
        'report.search.qualification': 'Education Qualification',
        'report.search.subject': 'Subject',
        'report.search.search': 'Search',
        'report.search.clear': 'Clear',
        'report.search.panelSubtitle': '',
        'report.search.panelSubtitleApplied': 'filters applied',
        'report.results.title': 'Results',
        'report.results.records': 'records',
        'report.search.sectionOrgRole': 'Organization & Role',
        'report.search.sectionJoiningDateRange': 'Joining Date Range',
        'report.search.fromDate': 'From Date',
        'report.search.toDate': 'To Date',
        'report.search.rabUnit': 'RAB Unit',
        'report.search.allUnits': 'All Units',
        'report.search.export': 'Export',
        'report.search.generateReport': 'Generate Report',
        'report.search.filtersActive': 'filters active',

        'report.table.ser': 'Ser',
        'report.table.orgName': 'Org Name',
        'report.table.serviceId': 'Service ID',
        'report.table.rank': 'Rank',
        'report.table.corps': 'Corps',
        'report.table.trade': 'Trade',
        'report.table.name': 'Name',
        'report.table.presentUnit': 'Present Unit',
        'report.table.joiningDate': 'Joining Date',
        'report.table.rmks': 'Rmks',
        'report.table.courseBatch': 'Course/Batch',
        'report.table.higherEducationQualification': 'Higher Education Qualification',
        'report.table.subject': 'Subject',

        'report.empty': 'No records found.'
    } as const,

    bn: {
        'report.pageTitle': 'কর্মচারী প্রতিবেদন',
        'report.reportTypeLabel': 'প্রতিবেদনের ধরণ',
        'report.placeholderReportType': 'প্রতিবেদনের ধরণ নির্বাচন করুন',
        'report.commonCodeLabel': 'কমন কোড',
        'report.placeholderCommonCode': 'কমন কোড নির্বাচন করুন',

        'report.title.memberAppointment': 'সদস্যের ধরণ / নিয়োগ ক্যাটাগরি / উইং / ব্যাটালিয়ন / মাতৃ সংস্থা',
        'report.title.batchCourse': 'সেবার মেয়াদ, ব্যাচ/কোর্স (যেমন ৩১তম BCS / 71 BMA LC)',
        'report.title.education': 'সম্মান / উচ্চ শিক্ষা বিষয়',

        'report.search.createList': 'অনুসন্ধান',
        'report.search.motherOrg': 'মাতৃ সংস্থা',
        'report.search.rank': 'পদবি',
        'report.search.trade': 'ট্রেড',
        'report.search.joiningDateFrom': 'যোগদানের তারিখ থেকে',
        'report.search.joiningDateTo': 'যোগদানের তারিখ পর্যন্ত',
        'report.search.courseBatch': 'কোর্স / ব্যাচ',
        'report.search.qualification': 'শিক্ষাগত যোগ্যতা',
        'report.search.subject': 'বিষয়',
        'report.search.search': 'অনুসন্ধান',
        'report.search.clear': 'মুছুন',
        'report.search.panelSubtitle': '',
        'report.search.panelSubtitleApplied': 'ফিল্টার প্রয়োগ করা হয়েছে',
        'report.results.title': 'ফলাফল',
        'report.results.records': 'রেকর্ড',
        'report.search.sectionOrgRole': 'সংস্থা ও ভূমিকা',
        'report.search.sectionJoiningDateRange': 'যোগদানের তারিখের সীমা',
        'report.search.fromDate': 'শুরুর তারিখ',
        'report.search.toDate': 'শেষ তারিখ',
        'report.search.rabUnit': 'র‍্যাব ইউনিট',
        'report.search.allUnits': 'সব ইউনিট',
        'report.search.export': 'রপ্তানি',
        'report.search.generateReport': 'প্রতিবেদন তৈরি করুন',
        'report.search.filtersActive': 'ফিল্টার সক্রিয়',

        'report.table.ser': 'ক্রমিক',
        'report.table.orgName': 'বাহিনীর নাম',
        'report.table.serviceId': 'ব্যক্তিগত নম্বর',
        'report.table.rank': 'পদবি',
        'report.table.corps': 'কোর',
        'report.table.trade': 'ট্রেড',
        'report.table.name': 'নাম',
        'report.table.presentUnit': 'বর্তমান ইউনিট',
        'report.table.joiningDate': 'র‍্যাবে যোগদানের তারিখ',
        'report.table.rmks': 'মন্তব্য',
        'report.table.courseBatch': 'ব্যাচ/কোর্স',
        'report.table.higherEducationQualification': 'শিক্ষাগত যোগ্যতা',
        'report.table.subject': 'বিষয়',

        'report.empty': 'কোন রেকর্ড পাওয়া যায়নি।'
    } as const
} as const;

export type ReportLang = keyof typeof REPORT_LABELS;
