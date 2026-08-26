export type Locale = "ja" | "en" | "ko";

export interface Dictionary {
  meta: {
    title: string;
    description: string;
  };
  nav: {
    brand: string;
    features: string;
    community: string;
    download: string;
    language: string;
  };
  hero: {
    badge: string;
    title: string;
    subtitle: string;
    downloadButton: string;
    platformNote: string;
    gdprNote: string;
    altstore: {
      button: string;
      sourceUrlLabel: string;
      regionNotice: string;
      notInstalledPrompt: string;
      officialSiteLinkText: string;
      notInstalledSuffix: string;
    };
    onside: {
      button: string;
      regionNotice: string;
      notInstalledPrompt: string;
      officialSiteLinkText: string;
      notInstalledSuffix: string;
    };
    activeUsersSample: {
      user1: { name: string; subject: string; time: string };
      user2: { name: string; subject: string; time: string };
      user3: { name: string; subject: string; time: string };
    };
  };
  features: {
    sectionTitle: string;
    sectionSubtitle: string;
    items: {
      realtime: {
        title: string;
        description: string;
      };
      logs: {
        title: string;
        description: string;
      };
      stats: {
        title: string;
        description: string;
      };
      privacy: {
        title: string;
        description: string;
      };
    };
  };
  community: {
    sectionTitle: string;
    sectionSubtitle: string;
    x: {
      title: string;
      description: string;
      button: string;
      url: string;
    };
    discord: {
      title: string;
      description: string;
      button: string;
      url: string;
    };
    form: {
      title: string;
      description: string;
      button: string;
      url: string;
    };
    email: {
      title: string;
      description: string;
      address: string;
    };
  };
  footer: {
    termsOfService: string;
    privacyPolicy: string;
    support: string;
    copyright: string;
  };
}
