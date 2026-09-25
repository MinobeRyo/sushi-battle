<?php
// One fixed, short health check. This is not a general proxy or a command runner.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET');
    http_response_code(405);
    echo json_encode(array('error' => 'method_not_allowed'));
    exit;
}

$result = array(
    'probe' => 'sushi-battle-route-v1',
    'php_executed' => true,
    'curl_available' => function_exists('curl_init'),
    'upstream_ok' => false
);

if ($result['curl_available']) {
    $request = curl_init('http://127.0.0.1:3001/health');
    curl_setopt_array($request, array(
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_TIMEOUT => 2,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROXY => ''
    ));
    $body = curl_exec($request);
    $status = curl_getinfo($request, CURLINFO_HTTP_CODE);
    unset($request);
    $decoded = is_string($body) ? json_decode($body, true) : null;
    $result['upstream_ok'] = $status === 200
        && is_array($decoded)
        && isset($decoded['ok'])
        && $decoded['ok'] === true;
}

echo json_encode($result);
