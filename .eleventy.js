module.exports = function (eleventyConfig) {
  // نسخ الأصول زي ما هي — من غير أي معالجة (نفس المسارات بالظبط)
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("js");
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("widgets");
  eleventyConfig.addPassthroughCopy("favicon.ico");
  eleventyConfig.addPassthroughCopy("favicon.svg");
  eleventyConfig.addPassthroughCopy("apple-touch-icon.png");
  eleventyConfig.addPassthroughCopy("robots.txt");
  eleventyConfig.addPassthroughCopy("sitemap.xml");
  eleventyConfig.addPassthroughCopy("_headers");

  return {
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    dir: {
      input: "content",
      includes: "_includes",
      output: "dist",
    },
    // كل صفحة بتحدد permalink بالظبط (مثلاً "about.html") في الـ front-matter،
    // فده بيتحكم في مسار الإخراج مباشرة — من غير أي "pretty URLs" تلقائية.
  };
};
