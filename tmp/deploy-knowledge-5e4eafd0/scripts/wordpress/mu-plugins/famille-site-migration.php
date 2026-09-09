<?php
/**
 * Plugin Name: Famille Site Migration
 * Description: LeadGrid URL compatibility and lightweight SEO defaults for the Famille site.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

function famille_migration_request_path(): string {
    $request_uri = isset($_SERVER['REQUEST_URI']) ? wp_unslash($_SERVER['REQUEST_URI']) : '/';
    $path = (string) wp_parse_url($request_uri, PHP_URL_PATH);
    $path = '/' . ltrim(rawurldecode($path), '/');
    return $path === '/' ? '/' : untrailingslashit($path);
}

function famille_migration_redirect(string $url): void {
    if ($url !== '') {
        wp_safe_redirect($url, 301, 'Famille LeadGrid migration');
        exit;
    }
}

add_action('template_redirect', static function (): void {
    if (is_admin() || wp_doing_ajax() || wp_doing_cron()) {
        return;
    }

    $path = famille_migration_request_path();

    // Keep the former staging hostname out of search results after the production URL switch.
    $home_host = (string) wp_parse_url(home_url('/'), PHP_URL_HOST);
    $request_host = isset($_SERVER['HTTP_HOST']) ? strtolower((string) wp_unslash($_SERVER['HTTP_HOST'])) : '';
    if ($home_host === 'www.shi-on.net' && $request_host === 'corprate.shi-on.net') {
        $query = isset($_SERVER['QUERY_STRING']) && $_SERVER['QUERY_STRING'] !== '' ? '?' . wp_unslash($_SERVER['QUERY_STRING']) : '';
        famille_migration_redirect(home_url($path . $query));
    }

    $fixed_paths = array(
        '/corporate' => '/about-us/',
        '/privacy' => '/privacy-policy/',
        '/recruit' => '/recruiting/',
        '/recruit/caremanager' => '/recruiting/careplan-takazoji/',
        '/complete' => '/contactus/',
        '/download/financial_statements/2023' => '/about-us/',
    );
    if (isset($fixed_paths[$path])) {
        famille_migration_redirect(home_url($fixed_paths[$path]));
    }

    if ($path === '/column' && isset($_GET['taxonomy_column_tags'])) {
        $value = wp_unslash($_GET['taxonomy_column_tags']);
        $legacy_slug = sanitize_key(is_array($value) ? (string) reset($value) : (string) $value);
        $term = get_term_by('slug', $legacy_slug, 'post_tag');
        if ($term) {
            $url = get_term_link($term);
            if (!is_wp_error($url)) {
                famille_migration_redirect($url);
            }
        }
    }

    if ($path === '/column') {
        $column = get_category_by_slug('column');
        if ($column) {
            $url = get_category_link($column->term_id);
            if (!is_wp_error($url)) {
                famille_migration_redirect($url);
            }
        }
    }

    $legacy_category_slugs = array(
        'sr0006', 'cat0001', 'cat0002', 'sr0008', 'sr0015', 'sr0016',
        'sr0011', 'sr0026', 'sr0044', 'sr0050', 'dai0001',
    );
    $legacy_tag_slugs = array(
        'sr0001', 'sr0002', 'sr0003', 'sr0004', 'sr0005', 'sr0007',
        'sr0009', 'sr0010', 'sr0013', 'sr0014', 'sr0017', 'sr0020',
        'sr0021', 'sr0022', 'sr0023', 'sr0025', 'sr0027', 'sr0028',
        'sr0029', 'sr0030', 'sr0031', 'sr0032', 'sr0033', 'sr0034',
        'sr0035', 'sr0038', 'sr0041', 'sr0042', 'sr0043', 'sr0045',
        'sr0046', 'sr0047', 'sr0048', 'sr0049', 'sr0051',
    );

    if (preg_match('#^/column/([a-z0-9_]+)$#i', $path, $matches)) {
        $legacy_slug = sanitize_key($matches[1]);

        $existing_post_ids = array(
            'c20240823001' => 1236,
            '20240831003' => 1182,
            '20240831007' => 1146,
            '20240831008' => 1096,
            '20240831009' => 1101,
            '20240831010' => 1108,
            '20240831011' => 1113,
            '20240831012' => 1131,
            '20240831013' => 1133,
            '20240831014' => 1139,
            '20240831015' => 1153,
            '20240831016' => 1158,
            '20240831017' => 1167,
            '20240831018' => 1172,
            '20240831021' => 932,
            '20240831041' => 1554,
        );
        if (isset($existing_post_ids[$legacy_slug])) {
            $url = get_permalink($existing_post_ids[$legacy_slug]);
            if ($url) {
                famille_migration_redirect($url);
            }
        }

        foreach (array($legacy_slug, $legacy_slug . '-2', $legacy_slug . '-3') as $candidate_slug) {
            $post = get_page_by_path($candidate_slug, OBJECT, 'post');
            if ($post instanceof WP_Post && $post->post_status === 'publish') {
                famille_migration_redirect(get_permalink($post));
            }
        }

        if (in_array($legacy_slug, $legacy_category_slugs, true)) {
            $term = get_term_by('slug', $legacy_slug, 'category');
            if ($term) {
                $url = get_term_link($term);
                if (!is_wp_error($url)) {
                    famille_migration_redirect($url);
                }
            }
        }
        if (in_array($legacy_slug, $legacy_tag_slugs, true)) {
            $term = get_term_by('slug', $legacy_slug, 'post_tag');
            if ($term) {
                $url = get_term_link($term);
                if (!is_wp_error($url)) {
                    famille_migration_redirect($url);
                }
            }
        }
    }

}, 1);

// WordPress core outputs canonical URLs but not a description meta tag.
add_action('wp_head', static function (): void {
    if (is_front_page()) {
        $description = get_bloginfo('description');
    } elseif (is_singular()) {
        $description = has_excerpt() ? get_the_excerpt() : wp_trim_words(wp_strip_all_tags(get_the_content()), 70, '');
    } elseif (is_category() || is_tag()) {
        $description = term_description();
    } else {
        $description = '';
    }
    $description = trim(wp_strip_all_tags((string) $description));
    if ($description !== '') {
        echo '<meta name="description" content="' . esc_attr($description) . '">' . "\n";
    }
}, 2);

add_action('wp_head', static function (): void {
    $site_name = get_bloginfo('name');
    $site_url = home_url('/');
    $logo_id = (int) get_theme_mod('custom_logo');
    $logo_url = $logo_id ? wp_get_attachment_image_url($logo_id, 'full') : '';
    $organization = array(
        '@type' => 'Organization',
        '@id' => $site_url . '#organization',
        'name' => $site_name,
        'url' => $site_url,
    );
    if ($logo_url) {
        $organization['logo'] = array('@type' => 'ImageObject', 'url' => $logo_url);
    }

    $graph = array($organization);
    if (is_front_page()) {
        $graph[] = array(
            '@type' => 'WebSite',
            '@id' => $site_url . '#website',
            'url' => $site_url,
            'name' => $site_name,
            'publisher' => array('@id' => $site_url . '#organization'),
            'inLanguage' => 'ja',
        );
    } elseif (is_single()) {
        $post_id = get_queried_object_id();
        $article = array(
            '@type' => 'Article',
            '@id' => get_permalink($post_id) . '#article',
            'mainEntityOfPage' => get_permalink($post_id),
            'headline' => get_the_title($post_id),
            'datePublished' => get_the_date(DATE_W3C, $post_id),
            'dateModified' => get_the_modified_date(DATE_W3C, $post_id),
            'author' => array('@type' => 'Person', 'name' => get_the_author_meta('display_name', (int) get_post_field('post_author', $post_id))),
            'publisher' => array('@id' => $site_url . '#organization'),
            'inLanguage' => 'ja',
        );
        $image = get_the_post_thumbnail_url($post_id, 'full');
        if ($image) {
            $article['image'] = array($image);
        }
        $graph[] = $article;
    }

    echo '<script type="application/ld+json">' . wp_json_encode(array('@context' => 'https://schema.org', '@graph' => $graph), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . '</script>' . "\n";
}, 3);
